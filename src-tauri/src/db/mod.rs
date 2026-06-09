//! SQLite persistence for sessions + transcript history (Milestone D).
//!
//! A single long-lived connection guarded by a `Mutex` is kept in Tauri-managed
//! state. Writes during a session are infrequent (one row per *final* segment),
//! so the mutex is never held long enough to matter. The connection is opened in
//! `lib.rs setup()` once the app data directory is known.
//!
//! The `Db` methods are grouped by domain across submodules ([`sessions`],
//! [`segments`], [`settings`], [`chat`], [`search`]); the shared types, schema,
//! and connection setup live here.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

use crate::error::AppResult;

mod chat;
mod search;
mod segments;
mod sessions;
mod settings;

#[cfg(test)]
mod tests;

const SCHEMA: &str = "
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT    NOT NULL,
    language      TEXT    NOT NULL,
    system_only   INTEGER NOT NULL DEFAULT 0,
    started_at    TEXT    NOT NULL,
    ended_at      TEXT,
    summary       TEXT,
    summary_model TEXT,
    summarized_at TEXT,
    video_path    TEXT
);

CREATE TABLE IF NOT EXISTS segments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    segment_id  TEXT    NOT NULL,
    source      TEXT    NOT NULL,
    speaker     TEXT,
    text        TEXT    NOT NULL,
    t_start     REAL    NOT NULL,
    t_end       REAL,
    confidence  REAL,
    translation      TEXT,
    translation_lang TEXT,
    UNIQUE (session_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_segments_session ON segments(session_id, t_start, id);

CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Chat (ask-about-this-transcript) history, one row per turn, scoped to a
-- session. `model` is the AI model name for assistant rows (NULL for the user's
-- questions). Rows cascade-delete with their session.
CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role        TEXT    NOT NULL,
    content     TEXT    NOT NULL,
    model       TEXT,
    created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id);

-- Full-text index over transcript text (FTS5, external-content = `segments`), so
-- the library can search across every transcript. Triggers keep it in sync; the
-- AFTER UPDATE one only re-indexes when `text` actually changes (rename-speaker
-- and save-translation touch other columns). Pre-existing rows are backfilled in
-- `migrate()`. FTS5 ships with rusqlite's `bundled` SQLite.
CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
    text,
    content = 'segments',
    content_rowid = 'id'
);

CREATE TRIGGER IF NOT EXISTS segments_ai AFTER INSERT ON segments BEGIN
    INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS segments_ad AFTER DELETE ON segments BEGIN
    INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER IF NOT EXISTS segments_au AFTER UPDATE ON segments
    WHEN new.text IS NOT old.text BEGIN
    INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text);
    INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text);
END;
";

/// One row of the session history list (with a transcript segment count).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: i64,
    pub title: String,
    pub language: String,
    pub system_only: bool,
    pub started_at: String,
    pub ended_at: Option<String>,
    /// AI summary (Markdown) and its provenance; `None` until generated (Milestone E).
    pub summary: Option<String>,
    pub summary_model: Option<String>,
    pub summarized_at: Option<String>,
    /// Absolute path to the saved screen recording (`.mp4`), or `None` if the
    /// session had no video recorded.
    pub video_path: Option<String>,
    pub segment_count: i64,
}

/// A stored transcript line (the persisted shape of a final `TranscriptSegment`).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredSegment {
    /// Stable per-line id (`{session}:{channel}:{start}`). Exposed so the history
    /// view can (re)translate a saved line via `translate_segment`.
    pub segment_id: String,
    pub source: String,
    pub speaker: Option<String>,
    pub text: String,
    pub t_start: f64,
    pub t_end: Option<f64>,
    pub confidence: Option<f64>,
    /// Live-translation of `text` (Milestone: live translate), or `None` if the
    /// line was never translated. `translation_lang` records the target language.
    pub translation: Option<String>,
    pub translation_lang: Option<String>,
}

/// A session plus its full transcript, for the detail view.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    pub session: SessionSummary,
    pub segments: Vec<StoredSegment>,
}

/// One full-text search result: a matching session with a highlighted snippet of
/// its best-matching line and how many of its lines matched.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub session_id: i64,
    pub title: String,
    pub started_at: String,
    /// Excerpt of the best-matching line with matched terms wrapped in `[`…`]`.
    pub snippet: String,
    pub match_count: i64,
}

/// One turn of the per-session transcript chat. `role` is `"user"` or
/// `"assistant"`; `model` is the AI model that produced an assistant reply
/// (`None` for the user's questions).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: i64,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub created_at: String,
}

/// Tauri-managed handle to the SQLite database.
pub struct Db(Mutex<Connection>);

impl Db {
    /// Open (creating if needed) the database at `path` and ensure the schema exists.
    pub fn open(path: &Path) -> AppResult<Db> {
        let conn = Connection::open(path)?;
        conn.execute_batch(SCHEMA)?;
        migrate(&conn)?;
        Ok(Db(Mutex::new(conn)))
    }
}

/// Add columns introduced after the first release to pre-existing databases.
/// Fresh databases already have them via `SCHEMA`; this keeps older `sososo.db`
/// files in sync (SQLite has no `ADD COLUMN IF NOT EXISTS`).
fn migrate(conn: &Connection) -> AppResult<()> {
    let existing = table_columns(conn, "sessions")?;
    for (name, ddl) in [
        ("summary", "ALTER TABLE sessions ADD COLUMN summary TEXT"),
        (
            "summary_model",
            "ALTER TABLE sessions ADD COLUMN summary_model TEXT",
        ),
        (
            "summarized_at",
            "ALTER TABLE sessions ADD COLUMN summarized_at TEXT",
        ),
        (
            "video_path",
            "ALTER TABLE sessions ADD COLUMN video_path TEXT",
        ),
    ] {
        if !existing.iter().any(|c| c == name) {
            conn.execute(ddl, [])?;
        }
    }

    let seg_existing = table_columns(conn, "segments")?;
    for (name, ddl) in [
        (
            "translation",
            "ALTER TABLE segments ADD COLUMN translation TEXT",
        ),
        (
            "translation_lang",
            "ALTER TABLE segments ADD COLUMN translation_lang TEXT",
        ),
    ] {
        if !seg_existing.iter().any(|c| c == name) {
            conn.execute(ddl, [])?;
        }
    }

    // Build the FTS index for databases that predate it. `count(*)` on an
    // external-content FTS5 table reflects the *content* table (`segments`), not
    // the inverted index, so it can't tell us whether the index is populated —
    // gate the one-time `rebuild` (which rebuilds the index from `segments`) on a
    // settings flag instead. Afterwards the triggers keep the index in sync, so
    // this never re-runs unless the flag is cleared.
    let fts_built: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'fts_built'",
            [],
            |r| r.get(0),
        )
        .optional()?;
    if fts_built.is_none() {
        conn.execute(
            "INSERT INTO segments_fts(segments_fts) VALUES ('rebuild')",
            [],
        )?;
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES ('fts_built', '1') \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )?;
    }
    Ok(())
}

/// Column names of `table` via `PRAGMA table_info`.
fn table_columns(conn: &Connection, table: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn row_to_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionSummary> {
    Ok(SessionSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        language: row.get(2)?,
        system_only: row.get(3)?,
        started_at: row.get(4)?,
        ended_at: row.get(5)?,
        summary: row.get(6)?,
        summary_model: row.get(7)?,
        summarized_at: row.get(8)?,
        video_path: row.get(9)?,
        segment_count: row.get(10)?,
    })
}
