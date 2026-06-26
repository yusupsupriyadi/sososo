//! AI commands (Milestone E + live translate + transcript chat) over the active
//! provider (OpenAI, Gemini, Anthropic, GLM, Kimi, Grok, or DeepSeek). For every
//! command the DB mutex is held only for the synchronous read/write steps —
//! never across the network `await` — so the command futures stay `Send`.

use serde::Serialize;
use tauri::State;

use crate::db::{ChatMessage, Db};
use crate::error::{AppError, AppResult};
use crate::{ai, keys};

/// `app_settings` key for the persisted AI-summary output-language preference.
const SUMMARY_LANGUAGE_KEY: &str = "summary_language";

/// `app_settings` key for the active AI provider (a [`ai::Provider`] id, e.g.
/// "openai" | "gemini" | "anthropic" | "glm" | "kimi" | "grok" | "deepseek" |
/// "llama").
const AI_PROVIDER_KEY: &str = "ai_provider";

/// `app_settings` key for the local-Llama base URL (OpenAI-compatible); only used
/// when the active provider is `llama`. The model is stored like any other
/// provider's, under `ai_model:llama` (see [`ai_model_key`]).
const LLAMA_BASE_URL_KEY: &str = "llama_base_url";

/// `app_settings` key for the generic OpenAI-compatible base URL; only used when
/// the active provider is `openai-compatible`. The model is stored under
/// `ai_model:openai-compatible` (see [`ai_model_key`]).
const OPENAI_COMPATIBLE_BASE_URL_KEY: &str = "openai_compatible_base_url";

/// `app_settings` key holding a provider's chosen model (`ai_model:<id>`).
fn ai_model_key(provider: ai::Provider) -> String {
    format!("ai_model:{}", provider.id())
}

/// The user's chosen model for `provider`, or its built-in default when unset.
fn resolve_model(db: &Db, provider: ai::Provider) -> AppResult<String> {
    Ok(db
        .get_setting(&ai_model_key(provider))?
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| provider.default_model().to_string()))
}

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

/// Resolve the active provider into a ready-to-call [`ai::Backend`]: reads the
/// persisted provider setting, then either the matching keychain key (cloud
/// providers) or the local base URL + model (Llama). Synchronous — the returned
/// backend owns its strings, so callers never hold the DB lock across a network
/// `await`.
fn resolve_backend(db: &Db) -> AppResult<ai::Backend> {
    let setting = db
        .get_setting(AI_PROVIDER_KEY)?
        .unwrap_or_else(|| "openai".to_string());
    let provider = ai::Provider::from_setting(&setting);

    // Require a cloud provider's key from the keychain, with a friendly error.
    let require_key = |p: ai::Provider| -> AppResult<String> {
        keys::get_api_key(p.key_service())?.ok_or_else(|| {
            AppError::Config(format!("{} API key is not set (open Settings)", p.label()))
        })
    };

    Ok(match provider {
        ai::Provider::LlamaLocal => {
            // Local server (Ollama / LM Studio / llama.cpp): no cloud key; the
            // base URL comes from settings, the model like any other provider's.
            let base = db
                .get_setting(LLAMA_BASE_URL_KEY)?
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| ai::LLAMA_DEFAULT_BASE_URL.to_string());
            ai::Backend::OpenAiCompatible {
                endpoint: ai::llama_chat_url(&base),
                model: resolve_model(db, ai::Provider::LlamaLocal)?,
                label: ai::Provider::LlamaLocal.label(),
                api_key: ai::LLAMA_PLACEHOLDER_KEY.to_string(),
            }
        }
        ai::Provider::OpenAiCompatible => {
            // Generic OpenAI-compatible endpoint (OpenRouter, Qwen, etc.) with a
            // user-provided API key and base URL.
            let base = db
                .get_setting(OPENAI_COMPATIBLE_BASE_URL_KEY)?
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());
            ai::Backend::OpenAiCompatible {
                endpoint: ai::llama_chat_url(&base),
                model: resolve_model(db, ai::Provider::OpenAiCompatible)?,
                label: ai::Provider::OpenAiCompatible.label(),
                api_key: require_key(ai::Provider::OpenAiCompatible)?,
            }
        }
        ai::Provider::Gemini => ai::Backend::Gemini {
            model: resolve_model(db, ai::Provider::Gemini)?,
            api_key: require_key(ai::Provider::Gemini)?,
        },
        ai::Provider::Anthropic => ai::Backend::Anthropic {
            model: resolve_model(db, ai::Provider::Anthropic)?,
            api_key: require_key(ai::Provider::Anthropic)?,
        },
        cloud => {
            // OpenAI / GLM / Kimi / Grok / DeepSeek — all OpenAI-compatible.
            let (endpoint, _default_model) = cloud
                .openai_compatible()
                .expect("non-local, non-Gemini/Anthropic provider is OpenAI-compatible");
            ai::Backend::OpenAiCompatible {
                endpoint: endpoint.to_string(),
                model: resolve_model(db, cloud)?,
                label: cloud.label(),
                api_key: require_key(cloud)?,
            }
        }
    })
}

/// Read the chosen model for a provider (stored override or its built-in
/// default). Used by Settings to populate the per-provider model field.
#[tauri::command]
pub fn get_ai_model(db: State<'_, Db>, provider: String) -> AppResult<String> {
    let p = ai::Provider::try_from_setting(&provider)
        .ok_or_else(|| AppError::Config(format!("unknown AI provider: {provider}")))?;
    resolve_model(&db, p)
}

/// Persist the chosen model for a provider. An empty value resets to the default.
#[tauri::command]
pub fn set_ai_model(db: State<'_, Db>, provider: String, model: String) -> AppResult<()> {
    let p = ai::Provider::try_from_setting(&provider)
        .ok_or_else(|| AppError::Config(format!("unknown AI provider: {provider}")))?;
    db.set_setting(&ai_model_key(p), model.trim())
}

/// The persisted local-Llama backend config, returned to Settings.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlamaConfig {
    /// OpenAI-compatible base URL (e.g. `http://localhost:11434/v1`).
    pub base_url: String,
    /// Model name as known to the local server (e.g. `llama3.1`).
    pub model: String,
}

/// Read the local-Llama base URL + model, falling back to the Ollama defaults
/// when unset. Used by Settings to populate the local-Llama config inputs. (The
/// model shares the unified `ai_model:llama` key so the per-provider model field
/// and this block agree.)
#[tauri::command]
pub fn get_llama_config(db: State<'_, Db>) -> AppResult<LlamaConfig> {
    let base_url = db
        .get_setting(LLAMA_BASE_URL_KEY)?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| ai::LLAMA_DEFAULT_BASE_URL.to_string());
    let model = resolve_model(&db, ai::Provider::LlamaLocal)?;
    Ok(LlamaConfig { base_url, model })
}

/// Persist the local-Llama base URL + model. Empty values reset to the defaults.
#[tauri::command]
pub fn set_llama_config(db: State<'_, Db>, base_url: String, model: String) -> AppResult<()> {
    db.set_setting(LLAMA_BASE_URL_KEY, base_url.trim())?;
    db.set_setting(&ai_model_key(ai::Provider::LlamaLocal), model.trim())
}

/// The persisted generic OpenAI-compatible backend config, returned to Settings.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenAiCompatibleConfig {
    /// OpenAI-compatible base URL (e.g. `https://openrouter.ai/api/v1`).
    pub base_url: String,
    /// Model name (e.g. `openai/gpt-4o-mini`).
    pub model: String,
}

/// Read the generic OpenAI-compatible base URL + model, falling back to
/// OpenRouter defaults when unset. Used by Settings to populate the config inputs.
#[tauri::command]
pub fn get_openai_compatible_config(db: State<'_, Db>) -> AppResult<OpenAiCompatibleConfig> {
    let base_url = db
        .get_setting(OPENAI_COMPATIBLE_BASE_URL_KEY)?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());
    let model = resolve_model(&db, ai::Provider::OpenAiCompatible)?;
    Ok(OpenAiCompatibleConfig { base_url, model })
}

/// Persist the generic OpenAI-compatible base URL + model. Empty values reset
/// to the defaults.
#[tauri::command]
pub fn set_openai_compatible_config(
    db: State<'_, Db>,
    base_url: String,
    model: String,
) -> AppResult<()> {
    db.set_setting(OPENAI_COMPATIBLE_BASE_URL_KEY, base_url.trim())?;
    db.set_setting(&ai_model_key(ai::Provider::OpenAiCompatible), model.trim())
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

    let backend = resolve_backend(&db)?;

    let (summary, model) = ai::summarize(
        &backend,
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

    let backend = resolve_backend(&db)?;

    let translated = ai::translate(&backend, &text, &target_lang).await?;
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

    let backend = resolve_backend(&db)?;

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
        &backend,
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
