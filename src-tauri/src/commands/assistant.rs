//! AI commands (Milestone E + live translate + transcript chat) over the active
//! provider (OpenAI, Gemini, Anthropic, GLM, Kimi, Grok, or DeepSeek). For every
//! command the DB mutex is held only for the synchronous read/write steps —
//! never across the network `await` — so the command futures stay `Send`.

use tauri::State;

use crate::db::{ChatMessage, Db};
use crate::error::{AppError, AppResult};
use crate::{ai, keys};

/// `app_settings` key for the persisted AI-summary output-language preference.
const SUMMARY_LANGUAGE_KEY: &str = "summary_language";

/// `app_settings` key for the active AI provider (a [`ai::Provider`] id, e.g.
/// "openai" | "gemini" | "anthropic" | "glm" | "kimi" | "grok" | "deepseek").
const AI_PROVIDER_KEY: &str = "ai_provider";

/// How many of the most recent chat turns to send to the model per request. The
/// full transcript is always sent as context, so older turns are dropped first to
/// keep the prompt bounded.
const CHAT_HISTORY_LIMIT: usize = 20;

/// Read the persisted AI provider id (e.g. "openai" | "gemini" | "anthropic" |
/// "glm" | "kimi" | "grok" | "deepseek"). Defaults to "openai" when never set.
/// Used by Settings to populate the provider dropdown.
#[tauri::command]
pub fn get_ai_provider(db: State<'_, Db>) -> AppResult<String> {
    Ok(db
        .get_setting(AI_PROVIDER_KEY)?
        .unwrap_or_else(|| "openai".to_string()))
}

/// Persist the active AI provider. Accepts any known [`ai::Provider`] id
/// (case-insensitive); an unknown value is rejected so the persisted setting is
/// always resolvable.
#[tauri::command]
pub fn set_ai_provider(db: State<'_, Db>, provider: String) -> AppResult<()> {
    let normalized = ai::Provider::try_from_setting(&provider)
        .ok_or_else(|| AppError::Config(format!("unknown AI provider: {provider}")))?;
    db.set_setting(AI_PROVIDER_KEY, normalized.id())
}

/// Resolve the active AI provider and its API key (from the keychain). Reads the
/// persisted setting synchronously — the returned key is owned, so callers never
/// hold the DB lock across a network `await`.
fn resolve_ai_provider(db: &Db) -> AppResult<(ai::Provider, String)> {
    let setting = db
        .get_setting(AI_PROVIDER_KEY)?
        .unwrap_or_else(|| "openai".to_string());
    let provider = ai::Provider::from_setting(&setting);
    let key = keys::get_api_key(provider.key_service())?.ok_or_else(|| {
        AppError::Config(format!(
            "{} API key is not set (open Settings)",
            provider.label()
        ))
    })?;
    Ok((provider, key))
}

/// Read the persisted AI-summary output language (a Deepgram language code or the
/// literal `"auto"`). Defaults to `"auto"` when never set. Used by Settings to
/// populate the dropdown.
#[tauri::command]
pub fn get_summary_language(db: State<'_, Db>) -> AppResult<String> {
    Ok(db
        .get_setting(SUMMARY_LANGUAGE_KEY)?
        .unwrap_or_else(|| "auto".to_string()))
}

/// Persist the AI-summary output language (a language code or `"auto"`).
#[tauri::command]
pub fn set_summary_language(db: State<'_, Db>, language: String) -> AppResult<()> {
    db.set_setting(SUMMARY_LANGUAGE_KEY, &language)
}

/// Generate (and persist) an AI summary for a recorded session via the active AI
/// provider (OpenAI or Gemini), then return the Markdown summary. Requires that
/// provider's API key to be set in Settings.
///
/// `summary_language` is the desired output language: the literal `"auto"` (match
/// the transcript) or a human-readable language name (e.g. `"Indonesian"`). The
/// frontend resolves the persisted language code to this value.
#[tauri::command]
pub async fn summarize_session(
    db: State<'_, Db>,
    id: i64,
    summary_language: String,
) -> AppResult<String> {
    let detail = db
        .get_session(id)?
        .ok_or_else(|| AppError::Session("session not found".into()))?;
    if detail.segments.is_empty() {
        return Err(AppError::Session("no transcript to summarize yet".into()));
    }

    let (provider, key) = resolve_ai_provider(&db)?;

    let (summary, model) = ai::summarize(
        provider,
        &key,
        &detail.session.title,
        &detail.session.language,
        &summary_language,
        &detail.segments,
    )
    .await?;

    let at = chrono::Utc::now().to_rfc3339();
    db.save_summary(id, &summary, &model, &at)?;
    Ok(summary)
}

/// Translate one finalized transcript line via the active AI provider (OpenAI or
/// Gemini) into `target_lang` (a human-readable language name like "English") and
/// persist it on the segment row, returning the translated text.
///
/// Idempotent: if the row already has a translation for the same language it is
/// returned without calling the provider, so a line is never translated twice. The
/// frontend additionally caches per segment, so this is the defensive backstop.
/// Requires the active provider's key (Settings).
#[tauri::command]
pub async fn translate_segment(
    db: State<'_, Db>,
    session_id: i64,
    segment_id: String,
    text: String,
    target_lang: String,
) -> AppResult<String> {
    if let Some((existing, lang)) = db.get_translation(session_id, &segment_id)? {
        if lang == target_lang {
            return Ok(existing);
        }
    }

    let (provider, key) = resolve_ai_provider(&db)?;

    let translated = ai::translate(provider, &key, &text, &target_lang).await?;
    db.save_translation(session_id, &segment_id, &translated, &target_lang)?;
    Ok(translated)
}

/// All stored chat turns for a session (oldest first), for rendering the panel.
#[tauri::command]
pub fn get_chat_messages(db: State<'_, Db>, session_id: i64) -> AppResult<Vec<ChatMessage>> {
    db.get_chat_messages(session_id)
}

/// Delete a session's entire chat history.
#[tauri::command]
pub fn clear_chat(db: State<'_, Db>, session_id: i64) -> AppResult<()> {
    db.clear_chat_messages(session_id)
}

/// Ask a question about a session's transcript via the active AI provider (OpenAI
/// or Gemini) and persist the exchange. Returns the two newly stored turns
/// `[user, assistant]`. Requires the active provider's API key (Settings) and a
/// non-empty transcript. Rows are written only after the AI call succeeds, so a
/// failed turn leaves no orphan question in the history.
#[tauri::command]
pub async fn chat_session(
    db: State<'_, Db>,
    id: i64,
    message: String,
) -> AppResult<Vec<ChatMessage>> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err(AppError::Ai("message is empty".into()));
    }

    let detail = db
        .get_session(id)?
        .ok_or_else(|| AppError::Session("session not found".into()))?;
    if detail.segments.is_empty() {
        return Err(AppError::Session("no transcript to chat about yet".into()));
    }

    let (provider, key) = resolve_ai_provider(&db)?;

    // Send only the most recent turns (older ones dropped first) to bound tokens.
    let stored = db.get_chat_messages(id)?;
    let start = stored.len().saturating_sub(CHAT_HISTORY_LIMIT);
    let history: Vec<ai::ChatTurn> = stored[start..]
        .iter()
        .map(|m| ai::ChatTurn {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    let (reply, model) = ai::chat_about_transcript(
        provider,
        &key,
        &detail.session.title,
        &detail.segments,
        &history,
        trimmed,
    )
    .await?;

    let at = chrono::Utc::now().to_rfc3339();
    let user_msg = db.add_chat_message(id, "user", trimmed, None, &at)?;
    let assistant_msg = db.add_chat_message(id, "assistant", &reply, Some(&model), &at)?;
    Ok(vec![user_msg, assistant_msg])
}
