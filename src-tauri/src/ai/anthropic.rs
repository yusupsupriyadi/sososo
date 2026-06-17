//! Anthropic (Claude) Messages API transport.
//!
//! Unlike the OpenAI-compatible providers, Anthropic uses a distinct request
//! shape: the system instruction is a top-level `system` field (not a message),
//! `max_tokens` is required, auth is the `x-api-key` header, and the response is
//! a `content` array of typed blocks.

use std::time::Duration;

use serde::Deserialize;

use crate::error::{AppError, AppResult};

/// Anthropic: fast & inexpensive Haiku tier — analogous to `gpt-4o-mini` /
/// `gemini-2.5-flash`. Kept as a single constant so it is trivial to bump.
pub(crate) const ANTHROPIC_MODEL: &str = "claude-haiku-4-5";
const ANTHROPIC_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
/// Hard output cap (required by the Messages API). Plenty for a concise summary
/// or a single translated line.
const ANTHROPIC_MAX_TOKENS: u32 = 4096;

#[derive(Deserialize)]
struct AnthropicResponse {
    #[serde(default)]
    content: Vec<AnthropicBlock>,
}

#[derive(Deserialize)]
struct AnthropicBlock {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

/// Anthropic error envelope (`{ "error": { "message": ... } }`).
#[derive(Deserialize)]
struct AnthropicErrorEnvelope {
    error: AnthropicErrorBody,
}

#[derive(Deserialize)]
struct AnthropicErrorBody {
    message: String,
}

/// Messages API transport (system + single user turn). Thin wrapper over
/// [`anthropic_chat_messages`].
pub(crate) async fn anthropic_chat(
    api_key: &str,
    system: &str,
    user: &str,
    temperature: f32,
    timeout: Duration,
) -> AppResult<String> {
    let messages = serde_json::json!([ { "role": "user", "content": user } ]);
    anthropic_chat_messages(api_key, system, messages, temperature, timeout).await
}

/// Messages API transport given a fully-built `messages` array (for multi-turn
/// chats). Anthropic uses the roles `"user"` / `"assistant"` — the same names as
/// our [`crate::ai::ChatTurn`] — so callers can pass turns through unchanged. The
/// system instruction is a top-level field, never a message. Auth is the
/// `x-api-key` header (the key is never placed in the URL/query string).
pub(crate) async fn anthropic_chat_messages(
    api_key: &str,
    system: &str,
    messages: serde_json::Value,
    temperature: f32,
    timeout: Duration,
) -> AppResult<String> {
    let body = serde_json::json!({
        "model": ANTHROPIC_MODEL,
        "max_tokens": ANTHROPIC_MAX_TOKENS,
        "temperature": temperature,
        "system": system,
        "messages": messages,
    });

    let client = reqwest::Client::builder().timeout(timeout).build()?;
    let resp = client
        .post(ANTHROPIC_ENDPOINT)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let raw = resp.text().await?;

    if !status.is_success() {
        let detail = serde_json::from_str::<AnthropicErrorEnvelope>(&raw)
            .map(|e| e.error.message)
            .unwrap_or_else(|_| raw.clone());
        let hint = match status.as_u16() {
            400 | 401 | 403 => " (check the Anthropic API key in Settings)",
            _ => "",
        };
        return Err(AppError::Ai(format!("Anthropic {status}: {detail}{hint}")));
    }

    let parsed: AnthropicResponse = serde_json::from_str(&raw)
        .map_err(|e| AppError::Ai(format!("could not parse Anthropic response: {e}")))?;
    // Concatenate every text block (Claude may emit more than one).
    let text = parsed
        .content
        .into_iter()
        .filter(|b| b.kind == "text")
        .map(|b| b.text)
        .collect::<Vec<_>>()
        .join("")
        .trim()
        .to_string();

    if text.is_empty() {
        return Err(AppError::Ai("Anthropic returned no content".into()));
    }
    Ok(text)
}
