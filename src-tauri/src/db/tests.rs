//! Integration tests for the `Db` data layer, exercised against an in-memory
//! SQLite database wired through the real `SCHEMA` + `migrate()`.

use std::sync::Mutex;

use rusqlite::Connection;

use crate::events::TranscriptSegment;

use super::{migrate, Db, SCHEMA};

/// A fresh in-memory database, set up exactly like production but without disk.
fn mem_db() -> Db {
    let conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(SCHEMA).unwrap();
    migrate(&conn).unwrap();
    Db(Mutex::new(conn))
}

fn seg(session_id: i64, segment_id: &str, source: &str, text: &str) -> TranscriptSegment {
    TranscriptSegment {
        session_id,
        segment_id: segment_id.into(),
        source: source.into(),
        speaker: None,
        text: text.into(),
        t_start: 0.0,
        t_end: None,
        is_final: true,
        confidence: None,
    }
}

#[test]
fn create_then_finalize_keeps_a_session_that_has_segments() {
    let db = mem_db();
    let id = db
        .create_session("Meeting", "en", false, "2026-01-01T00:00:00Z")
        .unwrap();
    db.upsert_segment(&seg(id, "a", "you", "hello")).unwrap();
    let kept = db.finalize_session(id, "2026-01-01T00:10:00Z").unwrap();
    assert!(kept);
    let detail = db.get_session(id).unwrap().expect("session present");
    assert_eq!(
        detail.session.ended_at.as_deref(),
        Some("2026-01-01T00:10:00Z")
    );
    assert_eq!(detail.segments.len(), 1);
    assert_eq!(detail.segments[0].text, "hello");
}

#[test]
fn finalize_deletes_a_session_with_no_segments() {
    let db = mem_db();
    let id = db
        .create_session("Empty", "en", false, "2026-01-01T00:00:00Z")
        .unwrap();
    let kept = db.finalize_session(id, "2026-01-01T00:00:01Z").unwrap();
    assert!(!kept);
    assert!(db.get_session(id).unwrap().is_none());
}

#[test]
fn finalize_keeps_a_video_only_session_with_no_segments() {
    // A recording with no transcript must still be kept (we'd otherwise orphan
    // the saved .mp4). The session lifecycle sets the path before finalizing.
    let db = mem_db();
    let id = db
        .create_session("Recorded", "en", false, "2026-01-01T00:00:00Z")
        .unwrap();
    db.set_video_path(id, "C:/recordings/1.mp4").unwrap();
    let kept = db.finalize_session(id, "2026-01-01T00:05:00Z").unwrap();
    assert!(kept);
    let detail = db.get_session(id).unwrap().expect("kept for its video");
    assert_eq!(detail.segments.len(), 0);
    assert_eq!(
        detail.session.video_path.as_deref(),
        Some("C:/recordings/1.mp4")
    );
}

#[test]
fn video_path_is_absent_by_default_and_round_trips() {
    let db = mem_db();
    let id = db.create_session("S", "en", false, "t").unwrap();
    db.upsert_segment(&seg(id, "x", "you", "hi")).unwrap();
    assert_eq!(
        db.get_session(id).unwrap().unwrap().session.video_path,
        None
    );
    db.set_video_path(id, "/tmp/v.mp4").unwrap();
    assert_eq!(
        db.list_sessions().unwrap()[0].video_path.as_deref(),
        Some("/tmp/v.mp4")
    );
}

#[test]
fn upsert_segment_is_idempotent_on_segment_id() {
    let db = mem_db();
    let id = db.create_session("S", "en", false, "t").unwrap();
    db.upsert_segment(&seg(id, "x", "you", "interim")).unwrap();
    db.upsert_segment(&seg(id, "x", "you", "final")).unwrap();
    let detail = db.get_session(id).unwrap().unwrap();
    assert_eq!(detail.segments.len(), 1);
    assert_eq!(detail.segments[0].text, "final");
}

#[test]
fn list_sessions_returns_newest_first_with_segment_counts() {
    let db = mem_db();
    let a = db
        .create_session("A", "en", false, "2026-01-01T00:00:00Z")
        .unwrap();
    let b = db
        .create_session("B", "en", false, "2026-01-02T00:00:00Z")
        .unwrap();
    db.upsert_segment(&seg(a, "a1", "you", "hi")).unwrap();
    db.upsert_segment(&seg(b, "b1", "you", "hi")).unwrap();
    db.upsert_segment(&seg(b, "b2", "remote", "yo")).unwrap();
    let list = db.list_sessions().unwrap();
    assert_eq!(list.len(), 2);
    assert_eq!(list[0].title, "B"); // newer started_at first
    assert_eq!(list[0].segment_count, 2);
    assert_eq!(list[1].segment_count, 1);
}

#[test]
fn translation_round_trips_and_is_absent_by_default() {
    let db = mem_db();
    let id = db.create_session("S", "en", false, "t").unwrap();
    db.upsert_segment(&seg(id, "x", "you", "hello")).unwrap();
    assert_eq!(db.get_translation(id, "x").unwrap(), None);
    db.save_translation(id, "x", "halo", "id").unwrap();
    assert_eq!(
        db.get_translation(id, "x").unwrap(),
        Some(("halo".into(), "id".into()))
    );
}

#[test]
fn rename_speaker_matches_a_label_and_the_null_group() {
    let db = mem_db();
    let id = db.create_session("S", "en", false, "t").unwrap();
    let mut diarized = seg(id, "x", "remote", "a");
    diarized.speaker = Some("1".into());
    db.upsert_segment(&diarized).unwrap();
    db.upsert_segment(&seg(id, "y", "remote", "b")).unwrap(); // NULL speaker

    assert_eq!(db.rename_speaker(id, Some("1"), "Alice").unwrap(), 1);
    assert_eq!(db.rename_speaker(id, None, "Bob").unwrap(), 1);

    let detail = db.get_session(id).unwrap().unwrap();
    let speakers: Vec<_> = detail.segments.iter().map(|s| s.speaker.clone()).collect();
    assert!(speakers.contains(&Some("Alice".into())));
    assert!(speakers.contains(&Some("Bob".into())));
}

#[test]
fn settings_round_trip_and_overwrite() {
    let db = mem_db();
    assert_eq!(db.get_setting("k").unwrap(), None);
    db.set_setting("k", "v1").unwrap();
    assert_eq!(db.get_setting("k").unwrap(), Some("v1".into()));
    db.set_setting("k", "v2").unwrap();
    assert_eq!(db.get_setting("k").unwrap(), Some("v2".into()));
}

#[test]
fn chat_messages_append_in_order_and_clear() {
    let db = mem_db();
    let id = db.create_session("S", "en", false, "t").unwrap();
    db.add_chat_message(id, "user", "hi", None, "t1").unwrap();
    db.add_chat_message(id, "assistant", "hello", Some("gpt-4o-mini"), "t2")
        .unwrap();
    let msgs = db.get_chat_messages(id).unwrap();
    assert_eq!(msgs.len(), 2);
    assert_eq!(msgs[0].role, "user");
    assert_eq!(msgs[1].model.as_deref(), Some("gpt-4o-mini"));
    db.clear_chat_messages(id).unwrap();
    assert!(db.get_chat_messages(id).unwrap().is_empty());
}

#[test]
fn search_finds_matching_lines_and_skips_empty_queries() {
    let db = mem_db();
    let id = db
        .create_session("Talk", "en", false, "2026-01-01T00:00:00Z")
        .unwrap();
    db.upsert_segment(&seg(id, "a", "you", "the quick brown fox"))
        .unwrap();
    db.upsert_segment(&seg(id, "b", "remote", "lazy dog sleeps"))
        .unwrap();

    assert!(db.search_sessions("   ").unwrap().is_empty());

    let hits = db.search_sessions("quick").unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].session_id, id);
    assert!(hits[0].snippet.contains('[')); // matched term is wrapped
}

#[test]
fn search_counts_multiple_matching_lines_per_session() {
    let db = mem_db();
    let id = db.create_session("Talk", "en", false, "t").unwrap();
    db.upsert_segment(&seg(id, "a", "you", "alpha beta"))
        .unwrap();
    db.upsert_segment(&seg(id, "b", "remote", "alpha gamma"))
        .unwrap();
    let hits = db.search_sessions("alpha").unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].match_count, 2);
}
