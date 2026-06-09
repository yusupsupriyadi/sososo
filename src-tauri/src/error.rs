use thiserror::Error;

/// Application-wide error. Serializes to a plain string so it can be returned
/// directly from `#[tauri::command]` functions.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("audio error: {0}")]
    Audio(String),
    #[error("video error: {0}")]
    Video(String),
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_strings_are_prefixed_by_category() {
        assert_eq!(AppError::Audio("x".into()).to_string(), "audio error: x");
        assert_eq!(AppError::Video("x".into()).to_string(), "video error: x");
        assert_eq!(
            AppError::Session("x".into()).to_string(),
            "session error: x"
        );
        assert_eq!(AppError::Config("x".into()).to_string(), "config error: x");
        assert_eq!(AppError::Db("x".into()).to_string(), "database error: x");
        assert_eq!(AppError::Ai("x".into()).to_string(), "AI error: x");
    }

    #[test]
    fn serializes_to_a_plain_json_string() {
        // The frontend receives the error as a bare string, not a tagged object.
        let json = serde_json::to_string(&AppError::Db("oops".into())).unwrap();
        assert_eq!(json, "\"database error: oops\"");
    }
}
