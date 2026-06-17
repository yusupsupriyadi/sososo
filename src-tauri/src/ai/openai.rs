//! OpenAI Chat Completions transport.
//!
//! Shared by every OpenAI-compatible provider (OpenAI, GLM, Kimi, Grok,
//! DeepSeek): they differ only by `endpoint`, `model`, and a display `label`
//! for error messages — see [`crate::ai::Provider::openai_compatible`].

use std::time::Duration;

use serde::Deserialize;

use crate::error::{AppError, AppResult};

/// Which OpenAI-compatible backend to hit. Bundles the three values that vary
/// per provider so the transport functions stay under clippy's arg-count limit.
/// Borrows its strings so a runtime-configured local endpoint/model (Llama) can
/// be passed as easily as the `&'static` cloud constants.
#[derive(Clone, Copy)]
pub(crate) struct OpenAiBackend<'a> {
    pub endpoint: &'a str,
    pub model: &'a str,
    /// Provider display name, used only in error messages (e.g. "DeepSeek").
    pub label: &'a str,
}

#[derive(Deserialize)]
struct OpenAiChatResponse {
    choices: Vec<OpenAiChoice>,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Deserialize)]
struct OpenAiMessage {
    content: String,
}

/// OpenAI error response envelope (`{ "error": { "message": ... } }`).
#[derive(Deserialize)]
struct OpenAiErrorEnvelope {
    error: OpenAiErrorBody,
}

#[derive(Deserialize)]
struct OpenAiErrorBody {
    message: String,
}

/// OpenAI-compatible Chat Completions transport (system + single user turn).
/// Thin wrapper over [`openai_chat_messages`].
pub(crate) async fn openai_chat(
    backend: &OpenAiBackend<'_>,
    api_key: &str,
    system: &str,
    user: &str,
    temperature: f32,
    timeout: Duration,
) -> AppResult<String> {
    let messages = serde_json::json!([
        { "role": "system", "content": system },
        { "role": "user", "content": user },
    ]);
    openai_chat_messages(backend, api_key, messages, temperature, timeout).await
}

/// OpenAI-compatible Chat Completions transport given a fully-built `messages`
/// array (so multi-turn chats can include prior turns alongside the system +
/// user message). `backend` selects the endpoint/model and names the provider in
/// any error message.
pub(crate) async fn openai_chat_messages(
    backend: &OpenAiBackend<'_>,
    api_key: &str,
    messages: serde_json::Value,
    temperature: f32,
    timeout: Duration,
) -> AppResult<String> {
    let OpenAiBackend {
        endpoint,
        model,
        label,
    } = *backend;
    let body = serde_json::json!({
        "model": model,
        "temperature": temperature,
        "messages": messages,
    });

    let client = reqwest::Client::builder().timeout(timeout).build()?;
    let resp = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let raw = resp.text().await?;

    if !status.is_success() {
        let detail = serde_json::from_str::<OpenAiErrorEnvelope>(&raw)
            .map(|e| e.error.message)
            .unwrap_or_else(|_| raw.clone());
        let hint = if status.as_u16() == 401 {
            format!(" (check the {label} API key in Settings)")
        } else {
            String::new()
        };
        return Err(AppError::Ai(format!("{label} {status}: {detail}{hint}")));
    }

    let parsed: OpenAiChatResponse = serde_json::from_str(&raw)
        .map_err(|e| AppError::Ai(format!("could not parse {label} response: {e}")))?;
    parsed
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Ai(format!("{label} returned no content")))
}
