//! AI meeting-summary generation via the OpenAI Chat Completions API (Milestone E).
//!
//! Invoked by the `summarize_session` command once a transcript exists. The
//! OpenAI key is read from the OS keychain (never the frontend) and the request
//! is sent with the `reqwest` client already in the dependency tree (rustls).
//! The stored transcript is rendered to a speaker-labelled plain-text block and
//! the model is asked for a concise English summary in a fixed Markdown
//! shape (Summary / Key Points / Action Items).

use std::time::Duration;

use serde::Deserialize;

use crate::db::StoredSegment;
use crate::error::{AppError, AppResult};

/// Default chat model: broadly available, inexpensive, 128k context, and strong
/// at summarization. Kept as a single constant so it is trivial to change.
const MODEL: &str = "gpt-4o-mini";
const ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";
/// Soft cap on transcript characters sent to the model (~15k tokens) so requests
/// stay bounded; longer transcripts are truncated with a visible marker.
const MAX_TRANSCRIPT_CHARS: usize = 60_000;

const SYSTEM_PROMPT: &str = "You are an assistant that summarizes meeting or conversation transcripts into clear, concise, well-structured English. Use ONLY information present in the transcript — do not invent facts. In the transcript, \"You\" is the app user (microphone audio) and \"Other\" is the system/other participants' audio. If the transcript is too short or not meaningful, say so briefly instead of forcing a summary.";

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<Choice>,
}

#[derive(Deserialize)]
struct Choice {
    message: ChatMessage,
}

#[derive(Deserialize)]
struct ChatMessage {
    content: String,
}

/// OpenAI error response envelope (`{ "error": { "message": ... } }`).
#[derive(Deserialize)]
struct ApiErrorEnvelope {
    error: ApiErrorBody,
}

#[derive(Deserialize)]
struct ApiErrorBody {
    message: String,
}

/// Render stored transcript segments into a speaker-labelled plain-text block,
/// e.g. `You: ...` / `Other (speaker 1): ...`.
pub fn render_transcript(segments: &[StoredSegment]) -> String {
    let mut out = String::new();
    for seg in segments {
        let text = seg.text.trim();
        if text.is_empty() {
            continue;
        }
        let who = if seg.source == "you" { "You" } else { "Other" };
        match seg.speaker.as_deref() {
            Some(s) if !s.is_empty() => out.push_str(&format!("{who} (speaker {s}): {text}\n")),
            _ => out.push_str(&format!("{who}: {text}\n")),
        }
    }
    if out.len() > MAX_TRANSCRIPT_CHARS {
        let mut cut = MAX_TRANSCRIPT_CHARS;
        while !out.is_char_boundary(cut) {
            cut -= 1;
        }
        out.truncate(cut);
        out.push_str("\n[…transcript truncated (too long)…]\n");
    }
    out
}

/// Generate an English summary of the transcript. Returns
/// `(summary_markdown, model_used)`.
pub async fn summarize(
    api_key: &str,
    title: &str,
    language: &str,
    segments: &[StoredSegment],
) -> AppResult<(String, String)> {
    let transcript = render_transcript(segments);
    if transcript.trim().is_empty() {
        return Err(AppError::Ai(
            "transcript is empty, nothing to summarize".into(),
        ));
    }

    let user_prompt = format!(
        "Session title: {title}\nTranscript language code: {language}\n\n\
         Write a summary in English using exactly this Markdown format:\n\n\
         ## Summary\n(2-4 sentences of the core discussion)\n\n\
         ## Key Points\n- (the main points, one per line)\n\n\
         ## Action Items\n- (decisions or action items; write \"None\" if there are none)\n\n\
         Transcript:\n{transcript}"
    );

    let body = serde_json::json!({
        "model": MODEL,
        "temperature": 0.3,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": user_prompt },
        ],
    });

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(90))
        .build()?;

    let resp = client
        .post(ENDPOINT)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let raw = resp.text().await?;

    if !status.is_success() {
        let detail = serde_json::from_str::<ApiErrorEnvelope>(&raw)
            .map(|e| e.error.message)
            .unwrap_or_else(|_| raw.clone());
        let hint = if status.as_u16() == 401 {
            " (check the OpenAI API key in Settings)"
        } else {
            ""
        };
        return Err(AppError::Ai(format!("OpenAI {status}: {detail}{hint}")));
    }

    let parsed: ChatResponse = serde_json::from_str(&raw)
        .map_err(|e| AppError::Ai(format!("could not parse OpenAI response: {e}")))?;
    let summary = parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Ai("OpenAI returned no summary".into()))?;

    Ok((summary, MODEL.to_string()))
}
