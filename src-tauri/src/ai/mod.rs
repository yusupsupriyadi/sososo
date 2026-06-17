//! AI meeting-summary generation + live translation + transcript chat across
//! several interchangeable providers (Milestone E).
//!
//! Invoked by the `summarize_session` / `translate_segment` / `chat_session`
//! commands. The active provider is a per-app setting (persisted in SQLite); the
//! matching API key is read from the OS keychain (never the frontend) and the
//! request is sent with the `reqwest` client already in the dependency tree
//! (rustls).
//!
//! All providers share the same prompts and the same transcript rendering — only
//! the HTTP transport differs. OpenAI, GLM, Kimi, Grok and DeepSeek all speak the
//! OpenAI Chat Completions wire format (see [`openai`]) and differ only by base
//! URL + model (see [`Provider::openai_compatible`]); Google Gemini
//! (`generateContent`, see [`gemini`]) and Anthropic (the Messages API, see
//! [`anthropic`]) have bespoke request/response shapes. The stored transcript is
//! rendered (see [`transcript`]) to a speaker-labelled plain-text block and the
//! model is asked for a concise summary in a fixed Markdown shape (Summary / Key
//! Points / Action Items). The output language is configurable (`"auto"` follows
//! the transcript language, or a specific language name is requested).

mod anthropic;
mod gemini;
mod openai;
mod provider;
mod transcript;

use std::time::Duration;

pub use provider::Provider;
pub use transcript::render_transcript;

use crate::db::StoredSegment;
use crate::error::AppResult;

const SYSTEM_PROMPT: &str = "You are an assistant that summarizes meeting or conversation transcripts into a clear, concise, well-structured Markdown summary — use headings, bullet or numbered lists, and **bold** to emphasize key terms. Follow the output-language instruction in the user message exactly. Use ONLY information present in the transcript — do not invent facts. In the transcript, \"You\" is the app user (microphone audio) and \"Other\" is the system/other participants' audio. If the transcript is too short or not meaningful, say so briefly instead of forcing a summary.";

/// System instruction for the per-session transcript chat (`chat_about_transcript`).
/// The full transcript is appended after this in the system message.
const CHAT_SYSTEM_PROMPT: &str = "You are a helpful assistant answering questions about a meeting/conversation transcript. Use ONLY information present in the transcript — do not invent facts. If the answer is not in the transcript, say so clearly. In the transcript, \"You\" is the app user (microphone audio) and \"Other\" is the system/other participants' audio. Reply in the SAME language as the user's question. Keep answers concise; you may use simple Markdown (headings, **bold**, lists) for clarity.";

/// Provider-agnostic single-turn chat: given a system instruction + user content,
/// returns the model's text reply and the model name used. Dispatches to the
/// right transport based on `provider`.
async fn chat(
    provider: Provider,
    api_key: &str,
    system: &str,
    user: &str,
    temperature: f32,
    timeout: Duration,
) -> AppResult<(String, String)> {
    // OpenAI, GLM, Kimi, Grok and DeepSeek all share the OpenAI transport.
    if let Some((endpoint, model)) = provider.openai_compatible() {
        let backend = openai::OpenAiBackend {
            endpoint,
            model,
            label: provider.label(),
        };
        let text =
            openai::openai_chat(&backend, api_key, system, user, temperature, timeout).await?;
        return Ok((text, model.to_string()));
    }
    match provider {
        Provider::Gemini => {
            let text = gemini::gemini_chat(api_key, system, user, temperature, timeout).await?;
            Ok((text, gemini::GEMINI_MODEL.to_string()))
        }
        Provider::Anthropic => {
            let text =
                anthropic::anthropic_chat(api_key, system, user, temperature, timeout).await?;
            Ok((text, anthropic::ANTHROPIC_MODEL.to_string()))
        }
        // Every OpenAI-compatible provider is handled by the early return above.
        _ => unreachable!("OpenAI-compatible providers are handled above"),
    }
}

/// Generate a summary of the transcript via `provider`. `summary_language` is the
/// desired output language: the literal `"auto"` (match the transcript's language)
/// or a human-readable language name like `"English"` / `"Indonesian"`. Returns
/// `(summary_markdown, model_used)`.
pub async fn summarize(
    provider: Provider,
    api_key: &str,
    title: &str,
    language: &str,
    summary_language: &str,
    segments: &[StoredSegment],
) -> AppResult<(String, String)> {
    let transcript = render_transcript(segments);
    if transcript.trim().is_empty() {
        return Err(crate::error::AppError::Ai(
            "transcript is empty, nothing to summarize".into(),
        ));
    }

    let language_directive = if summary_language.eq_ignore_ascii_case("auto") {
        "Write the summary in the SAME language as the transcript.".to_string()
    } else {
        format!(
            "Write the entire summary — including the section headings — in {summary_language}."
        )
    };

    let user_prompt = format!(
        "Session title: {title}\nTranscript language code: {language}\n\n\
         {language_directive} Format the summary as clean Markdown using exactly this \
         structure (translate the section headings into the output language too). Use \
         **bold** for key terms, names, decisions, dates, and numbers so it is easy to \
         skim, and *italic* for nuance where helpful:\n\n\
         ## Summary\n(2-4 sentences of the core discussion)\n\n\
         ## Key Points\n- (the main points, one per line; **bold** the crucial term in each)\n\n\
         ## Action Items\n1. (decisions or action items as a numbered list; **bold** the \
         owner/decision)\n(if there are none, write a single line: None)\n\n\
         Transcript:\n{transcript}"
    );

    chat(
        provider,
        api_key,
        SYSTEM_PROMPT,
        &user_prompt,
        0.3,
        Duration::from_secs(90),
    )
    .await
}

/// Translate a single finalized transcript line into `target_language` (a
/// human-readable name like "English") via `provider`. Returns ONLY the
/// translated text.
///
/// Invoked by the `translate_segment` command for live, per-segment translation,
/// so it is kept lightweight: a short timeout (it runs many times per session)
/// and a low temperature for faithful output.
pub async fn translate(
    provider: Provider,
    api_key: &str,
    text: &str,
    target_language: &str,
) -> AppResult<String> {
    let text = text.trim();
    if text.is_empty() {
        return Err(crate::error::AppError::Ai("nothing to translate".into()));
    }

    let system_prompt = format!(
        "You are a professional real-time translation engine. Translate the user's text into \
         {target_language}. Output ONLY the translation — no quotes, no notes, no preamble, no \
         transliteration. Preserve meaning, names, and tone. If the text is already in \
         {target_language}, return it unchanged."
    );

    let (translated, _model) = chat(
        provider,
        api_key,
        &system_prompt,
        text,
        0.2,
        Duration::from_secs(30),
    )
    .await?;
    Ok(translated)
}

/// One prior turn of a transcript chat, passed to [`chat_about_transcript`].
/// `role` is `"user"` or `"assistant"` (Gemini's `"model"` mapping is internal).
pub struct ChatTurn {
    pub role: String,
    pub content: String,
}

/// Answer a free-form question about a session's transcript via `provider`, given
/// the prior conversation `history`. The full transcript (speaker-labelled, capped
/// by [`render_transcript`]) is sent as the system context every turn; `history`
/// carries the running dialogue. Returns `(reply_text, model_used)`.
///
/// Like [`summarize`], this performs a single non-streaming request. Temperature is
/// a touch higher than summaries for more natural answers, with a 60s timeout.
pub async fn chat_about_transcript(
    provider: Provider,
    api_key: &str,
    title: &str,
    segments: &[StoredSegment],
    history: &[ChatTurn],
    question: &str,
) -> AppResult<(String, String)> {
    let question = question.trim();
    if question.is_empty() {
        return Err(crate::error::AppError::Ai("question is empty".into()));
    }
    let transcript = render_transcript(segments);
    if transcript.trim().is_empty() {
        return Err(crate::error::AppError::Ai(
            "transcript is empty, nothing to chat about".into(),
        ));
    }

    let system =
        format!("{CHAT_SYSTEM_PROMPT}\n\nSession title: {title}\n\nTranscript:\n{transcript}");
    let temperature = 0.4;
    let timeout = Duration::from_secs(60);

    // OpenAI, GLM, Kimi, Grok and DeepSeek all share the OpenAI transport: the
    // system instruction is the first message, prior turns follow, then the
    // question.
    if let Some((endpoint, model)) = provider.openai_compatible() {
        let backend = openai::OpenAiBackend {
            endpoint,
            model,
            label: provider.label(),
        };
        let mut messages: Vec<serde_json::Value> = Vec::with_capacity(history.len() + 2);
        messages.push(serde_json::json!({ "role": "system", "content": system }));
        for turn in history {
            messages.push(serde_json::json!({ "role": turn.role, "content": turn.content }));
        }
        messages.push(serde_json::json!({ "role": "user", "content": question }));
        let text = openai::openai_chat_messages(
            &backend,
            api_key,
            serde_json::Value::Array(messages),
            temperature,
            timeout,
        )
        .await?;
        return Ok((text, model.to_string()));
    }
    match provider {
        Provider::Anthropic => {
            // Anthropic uses the roles "user"/"assistant" (same as ChatTurn) and
            // takes the system instruction as a top-level field, not a message.
            let mut messages: Vec<serde_json::Value> = Vec::with_capacity(history.len() + 1);
            for turn in history {
                let role = if turn.role == "assistant" {
                    "assistant"
                } else {
                    "user"
                };
                messages.push(serde_json::json!({ "role": role, "content": turn.content }));
            }
            messages.push(serde_json::json!({ "role": "user", "content": question }));
            let text = anthropic::anthropic_chat_messages(
                api_key,
                &system,
                serde_json::Value::Array(messages),
                temperature,
                timeout,
            )
            .await?;
            Ok((text, anthropic::ANTHROPIC_MODEL.to_string()))
        }
        Provider::Gemini => {
            let mut contents: Vec<serde_json::Value> = Vec::with_capacity(history.len() + 1);
            for turn in history {
                // Gemini names the assistant role "model"; the user role matches.
                let role = if turn.role == "assistant" {
                    "model"
                } else {
                    "user"
                };
                contents.push(
                    serde_json::json!({ "role": role, "parts": [ { "text": turn.content } ] }),
                );
            }
            contents.push(serde_json::json!({ "role": "user", "parts": [ { "text": question } ] }));
            let text = gemini::gemini_chat_messages(
                api_key,
                &system,
                serde_json::Value::Array(contents),
                temperature,
                timeout,
            )
            .await?;
            Ok((text, gemini::GEMINI_MODEL.to_string()))
        }
        // Every OpenAI-compatible provider is handled by the early return above.
        _ => unreachable!("OpenAI-compatible providers are handled above"),
    }
}
