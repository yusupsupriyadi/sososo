//! SQLite persistence for sessions + transcript history (Milestone D).
//!
//! A single long-lived connection guarded by a `Mutex` is kept in Tauri-managed
//! state. Writes during a session are infrequent (one row per *final* segment),
//! so the mutex is never held long enough to matter. The connection is opened in
//! `lib.rs setup()` once the app data directory is known.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

use crate::error::AppResult;
use crate::events::TranscriptSegment;

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
    summarized_at TEXT
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
    pub segment_count: i64,
}

/// A stored transcript line (the persisted shape of a final `TranscriptSegment`).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StoredSegment {
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

    /// Insert a new session row and return its database id.
    pub fn create_session(
        &self,
        title: &str,
        language: &str,
        system_only: bool,
        started_at: &str,
    ) -> AppResult<i64> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (title, language, system_only, started_at) \
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![title, language, system_only, started_at],
        )?;
        Ok(conn.last_insert_rowid())
    }

    /// Set `ended_at` if the session produced any segments; otherwise delete the
    /// empty row so failed or instantly-stopped starts don't clutter the history.
    /// Returns `true` if the session was kept.
    pub fn finalize_session(&self, id: i64, ended_at: &str) -> AppResult<bool> {
        let conn = self.0.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM segments WHERE session_id = ?1",
            [id],
            |r| r.get(0),
        )?;
        if count == 0 {
            conn.execute("DELETE FROM sessions WHERE id = ?1", [id])?;
            Ok(false)
        } else {
            conn.execute(
                "UPDATE sessions SET ended_at = ?1 WHERE id = ?2",
                rusqlite::params![ended_at, id],
            )?;
            Ok(true)
        }
    }

    /// Persist a final transcript segment (idempotent on (session_id, segment_id)).
    pub fn upsert_segment(&self, seg: &TranscriptSegment) -> AppResult<()> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "INSERT INTO segments \
               (session_id, segment_id, source, speaker, text, t_start, t_end, confidence) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
             ON CONFLICT(session_id, segment_id) DO UPDATE SET \
               text = excluded.text, speaker = excluded.speaker, \
               t_end = excluded.t_end, confidence = excluded.confidence",
            rusqlite::params![
                seg.session_id,
                seg.segment_id,
                seg.source,
                seg.speaker,
                seg.text,
                seg.t_start,
                seg.t_end,
                seg.confidence,
            ],
        )?;
        Ok(())
    }

    /// Store the live translation for a finalized segment (idempotent on
    /// (session_id, segment_id)). The matching row is created by `upsert_segment`
    /// before the frontend requests a translation, so this only updates columns.
    pub fn save_translation(
        &self,
        session_id: i64,
        segment_id: &str,
        translation: &str,
        lang: &str,
    ) -> AppResult<()> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE segments SET translation = ?1, translation_lang = ?2 \
             WHERE session_id = ?3 AND segment_id = ?4",
            rusqlite::params![translation, lang, session_id, segment_id],
        )?;
        Ok(())
    }

    /// Existing translation for a segment as `(translation, lang)`, or `None`
    /// (also `None` when the row has no translation yet). Used to skip a second
    /// OpenAI call for an already-translated line.
    pub fn get_translation(
        &self,
        session_id: i64,
        segment_id: &str,
    ) -> AppResult<Option<(String, String)>> {
        let conn = self.0.lock().unwrap();
        let row = conn
            .query_row(
                "SELECT translation, translation_lang FROM segments \
                 WHERE session_id = ?1 AND segment_id = ?2",
                rusqlite::params![session_id, segment_id],
                |r| {
                    Ok((
                        r.get::<_, Option<String>>(0)?,
                        r.get::<_, Option<String>>(1)?,
                    ))
                },
            )
            .optional()?;
        Ok(match row {
            Some((Some(t), Some(l))) => Some((t, l)),
            _ => None,
        })
    }

    /// All sessions, newest first, each with its transcript segment count.
    pub fn list_sessions(&self) -> AppResult<Vec<SessionSummary>> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.title, s.language, s.system_only, s.started_at, s.ended_at, \
                    s.summary, s.summary_model, s.summarized_at, \
                    COUNT(seg.id) AS segment_count \
             FROM sessions s \
             LEFT JOIN segments seg ON seg.session_id = s.id \
             GROUP BY s.id \
             ORDER BY s.started_at DESC, s.id DESC",
        )?;
        let rows = stmt.query_map([], row_to_summary)?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    /// One session plus its full transcript (chronological), or `None` if missing.
    pub fn get_session(&self, id: i64) -> AppResult<Option<SessionDetail>> {
        let conn = self.0.lock().unwrap();
        let session = conn
            .query_row(
                "SELECT s.id, s.title, s.language, s.system_only, s.started_at, s.ended_at, \
                        s.summary, s.summary_model, s.summarized_at, \
                        COUNT(seg.id) AS segment_count \
                 FROM sessions s \
                 LEFT JOIN segments seg ON seg.session_id = s.id \
                 WHERE s.id = ?1 \
                 GROUP BY s.id",
                [id],
                row_to_summary,
            )
            .optional()?;

        let Some(session) = session else {
            return Ok(None);
        };

        let mut stmt = conn.prepare(
            "SELECT source, speaker, text, t_start, t_end, confidence, translation, translation_lang \
             FROM segments WHERE session_id = ?1 ORDER BY t_start, id",
        )?;
        let rows = stmt.query_map([id], |row| {
            Ok(StoredSegment {
                source: row.get(0)?,
                speaker: row.get(1)?,
                text: row.get(2)?,
                t_start: row.get(3)?,
                t_end: row.get(4)?,
                confidence: row.get(5)?,
                translation: row.get(6)?,
                translation_lang: row.get(7)?,
            })
        })?;
        let mut segments = Vec::new();
        for r in rows {
            segments.push(r?);
        }

        Ok(Some(SessionDetail { session, segments }))
    }

    /// Delete a session and its segments (cascades via the foreign key).
    pub fn delete_session(&self, id: i64) -> AppResult<()> {
        let conn = self.0.lock().unwrap();
        conn.execute("DELETE FROM sessions WHERE id = ?1", [id])?;
        Ok(())
    }

    /// Rename a session.
    pub fn rename_session(&self, id: i64, title: &str) -> AppResult<()> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET title = ?1 WHERE id = ?2",
            rusqlite::params![title, id],
        )?;
        Ok(())
    }

    /// Store (or replace) the AI-generated summary for a session (Milestone E).
    pub fn save_summary(&self, id: i64, summary: &str, model: &str, at: &str) -> AppResult<()> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET summary = ?1, summary_model = ?2, summarized_at = ?3 \
             WHERE id = ?4",
            rusqlite::params![summary, model, at, id],
        )?;
        Ok(())
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
        segment_count: row.get(9)?,
    })
}
