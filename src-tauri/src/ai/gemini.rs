//! Google Gemini `generateContent` transport.

use std::time::Duration;

use serde::Deserialize;

use crate::error::{AppError, AppResult};

const GEMINI_ENDPOINT_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";

#[derive(Deserialize)]
struct GeminiResponse {
    #[serde(default)]
    candidates: Vec<GeminiCandidate>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    // Absent when a candidate was blocked (e.g. safety) instead of producing text.
    content: Option<GeminiContent>,
}

#[derive(Deserialize)]
struct GeminiContent {
    #[serde(default)]
    parts: Vec<GeminiPart>,
}

#[derive(Deserialize)]
struct GeminiPart {
    #[serde(default)]
    text: String,
}

/// Gemini error response envelope (`{ "error": { "message": ... } }`).
#[derive(Deserialize)]
struct GeminiErrorEnvelope {
    error: GeminiErrorBody,
}

#[derive(Deserialize)]
struct GeminiErrorBody {
    message: String,
}

/// Gemini `generateContent` transport (system + single user turn). Thin wrapper
/// over [`gemini_chat_messages`].
pub(crate) async fn gemini_chat(
    api_key: &str,
    model: &str,
    system: &str,
    user: &str,
    temperature: f32,
    timeout: Duration,
) -> AppResult<String> {
    let contents = serde_json::json!([ { "role": "user", "parts": [ { "text": user } ] } ]);
    gemini_chat_messages(api_key, model, system, contents, temperature, timeout).await
}

/// Gemini `generateContent` transport given a fully-built `contents` array (for
/// multi-turn chats). Note Gemini uses the role `"model"` (not `"assistant"`) for
/// prior model turns — callers must map accordingly when building `contents`. Auth
/// is the `x-goog-api-key` header (the key is never placed in the URL/query string).
pub(crate) async fn gemini_chat_messages(
    api_key: &str,
    model: &str,
    system: &str,
    contents: serde_json::Value,
    temperature: f32,
    timeout: Duration,
) -> AppResult<String> {
    let url = format!("{GEMINI_ENDPOINT_BASE}/{model}:generateContent");
    let body = serde_json::json!({
        "systemInstruction": { "parts": [ { "text": system } ] },
        "contents": contents,
        "generationConfig": { "temperature": temperature },
    });

    let client = reqwest::Client::builder().timeout(timeout).build()?;
    let resp = client
        .post(&url)
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await?;

    let status = resp.status();
    let raw = resp.text().await?;

    if !status.is_success() {
        let detail = serde_json::from_str::<GeminiErrorEnvelope>(&raw)
            .map(|e| e.error.message)
            .unwrap_or_else(|_| raw.clone());
        let hint = match status.as_u16() {
            400 | 401 | 403 => " (check the Gemini API key in Settings)",
            _ => "",
        };
        return Err(AppError::Ai(format!("Gemini {status}: {detail}{hint}")));
    }

    let parsed: GeminiResponse = serde_json::from_str(&raw)
        .map_err(|e| AppError::Ai(format!("could not parse Gemini response: {e}")))?;
    parsed
        .candidates
        .into_iter()
        .next()
        .and_then(|c| c.content)
        .and_then(|c| c.parts.into_iter().next())
        .map(|p| p.text.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Ai("Gemini returned no content".into()))
}
