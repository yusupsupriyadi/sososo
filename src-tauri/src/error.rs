use thiserror::Error;

/// Application-wide error. Serializes to a plain string so it can be returned
/// directly from `#[tauri::command]` functions.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("audio error: {0}")]
    Audio(String),
    #[error("session error: {0}")]
    Session(String),
    #[error("config error: {0}")]
    Config(String),
    #[error("database error: {0}")]
    Db(String),
    #[error("AI error: {0}")]
    Ai(String),
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Db(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Ai(format!("request to OpenAI failed: {e}"))
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
