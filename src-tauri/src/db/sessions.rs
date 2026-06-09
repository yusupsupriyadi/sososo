//! Session-row lifecycle: create, finalize, list, fetch, rename, delete, summary.

use rusqlite::OptionalExtension;

use crate::error::AppResult;

use super::{row_to_summary, Db, SessionDetail, SessionSummary, StoredSegment};

impl Db {
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
        // Keep a recording even if nothing was transcribed — a saved video is
        // worth preserving on its own.
        let has_video: bool = conn
            .query_row(
                "SELECT video_path IS NOT NULL FROM sessions WHERE id = ?1",
                [id],
                |r| r.get(0),
            )
            .optional()?
            .unwrap_or(false);
        if count == 0 && !has_video {
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

    /// All sessions, newest first, each with its transcript segment count.
    pub fn list_sessions(&self) -> AppResult<Vec<SessionSummary>> {
        let conn = self.0.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT s.id, s.title, s.language, s.system_only, s.started_at, s.ended_at, \
                    s.summary, s.summary_model, s.summarized_at, s.video_path, \
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
                        s.summary, s.summary_model, s.summarized_at, s.video_path, \
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
            "SELECT segment_id, source, speaker, text, t_start, t_end, confidence, translation, translation_lang \
             FROM segments WHERE session_id = ?1 ORDER BY t_start, id",
        )?;
        let rows = stmt.query_map([id], |row| {
            Ok(StoredSegment {
                segment_id: row.get(0)?,
                source: row.get(1)?,
                speaker: row.get(2)?,
                text: row.get(3)?,
                t_start: row.get(4)?,
                t_end: row.get(5)?,
                confidence: row.get(6)?,
                translation: row.get(7)?,
                translation_lang: row.get(8)?,
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

    /// Record the saved screen-recording path for a session.
    pub fn set_video_path(&self, id: i64, path: &str) -> AppResult<()> {
        let conn = self.0.lock().unwrap();
        conn.execute(
            "UPDATE sessions SET video_path = ?1 WHERE id = ?2",
            rusqlite::params![path, id],
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
