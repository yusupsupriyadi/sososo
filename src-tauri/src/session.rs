use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use chrono::Utc;
use deepgram::common::options::{Encoding, Endpointing, Language, Model, Options};
use deepgram::common::stream_response::StreamResponse;
use deepgram::Deepgram;
use futures::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::audio::{capture, mixer::Interleaver, TARGET_SAMPLE_RATE};
use crate::db::Db;
use crate::events::{self, SessionState, TranscriptSegment};
use crate::video::{self, VideoStartConfig};

fn now() -> String {
    Utc::now().to_rfc3339()
}

/// Map a UI language code to a (model, language) pair. Every language now runs on
/// Nova-3 — it has the broadest coverage and the best accuracy, including
/// Indonesian streaming. `multi` = multilingual auto-detect (code-switching);
/// any other BCP-47 code passes straight through via `Language::Other`.
fn model_language(code: &str) -> (Model, Language) {
    let language = match code {
        "multi" => Language::multi,
        "en" => Language::en,
        "id" => Language::id,
        other => Language::Other(other.to_string()),
    };
    (Model::Nova3, language)
}

fn mono_to_bytes(samples: &[i16]) -> Vec<u8> {
    let mut out = Vec::with_capacity(samples.len() * 2);
    for s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

/// Start the async pipeline for an already-persisted session id (the row is
/// created by `start_session` so the id can be returned synchronously).
#[allow(clippy::too_many_arguments)]
pub fn spawn_session(
    app: AppHandle,
    session_id: i64,
    api_key: String,
    input_device: Option<String>,
    output_device: Option<String>,
    language: String,
    system_only: bool,
    cancel: CancellationToken,
    paused: Arc<AtomicBool>,
    video_cfg: Option<VideoStartConfig>,
) {
    tauri::async_runtime::spawn(run_session(
        app,
        session_id,
        api_key,
        input_device,
        output_device,
        language,
        system_only,
        cancel,
        paused,
        video_cfg,
    ));
}

#[allow(clippy::too_many_arguments)]
async fn run_session(
    app: AppHandle,
    session_id: i64,
    api_key: String,
    input_device: Option<String>,
    output_device: Option<String>,
    language: String,
    system_only: bool,
    cancel: CancellationToken,
    paused: Arc<AtomicBool>,
    video_cfg: Option<VideoStartConfig>,
) {
    let _ = app.emit(
        events::SESSION_STATE,
        SessionState::new(Some(session_id), "starting"),
    );

    // 1) Start captures. system_only => loopback alone (mono, no mic echo).
    let mic = if system_only {
        None
    } else {
        match capture::start_mic_capture(input_device) {
            Ok(h) => Some(h),
            Err(e) => return fail(&app, session_id, format!("microphone: {e}")),
        }
    };
    let sys = match capture::start_loopback_capture(output_device) {
        Ok(h) => h,
        Err(e) => return fail(&app, session_id, format!("system audio: {e}")),
    };
    let channels: u16 = if system_only { 1 } else { 2 };

    // 2) Bridge realtime crossbeam streams -> futures audio stream.
    let (mut audio_tx, audio_rx) =
        futures::channel::mpsc::channel::<Result<Bytes, std::io::Error>>(32);
    let sys_rx = sys.rx.clone();
    let mic_rx = mic.as_ref().map(|m| m.rx.clone());
    let bridge_cancel = cancel.clone();
    let bridge_paused = paused.clone();
    let bridge = tauri::async_runtime::spawn(async move {
        let mut interleaver = Interleaver::new(TARGET_SAMPLE_RATE as usize / 5);
        let mut tick = tokio::time::interval(Duration::from_millis(40));
        loop {
            tokio::select! {
                _ = bridge_cancel.cancelled() => break,
                _ = tick.tick() => {
                    let bytes = if bridge_paused.load(Ordering::Relaxed) {
                        // Paused: discard captured audio so the bounded channels stay
                        // fresh, and forward nothing — the SDK keep-alive holds the WS open.
                        if let Some(mic_rx) = &mic_rx {
                            while mic_rx.try_recv().is_ok() {}
                        }
                        while sys_rx.try_recv().is_ok() {}
                        Vec::new()
                    } else if let Some(mic_rx) = &mic_rx {
                        // mic = ch0 ("You"), system = ch1 (remote)
                        while let Ok(chunk) = mic_rx.try_recv() { interleaver.push_mic(&chunk); }
                        while let Ok(chunk) = sys_rx.try_recv() { interleaver.push_system(&chunk); }
                        interleaver.drain_interleaved_bytes()
                    } else {
                        // system only -> mono
                        let mut buf: Vec<i16> = Vec::new();
                        while let Ok(chunk) = sys_rx.try_recv() { buf.extend_from_slice(&chunk); }
                        mono_to_bytes(&buf)
                    };
                    if !bytes.is_empty()
                        && audio_tx.send(Ok(Bytes::from(bytes))).await.is_err()
                    {
                        break;
                    }
                }
            }
        }
    });

    // 3) Open the Deepgram live stream. keep_alive() is auto-sent by the SDK.
    let dg = match Deepgram::new(&api_key) {
        Ok(d) => d,
        Err(e) => {
            cancel.cancel();
            let _ = bridge.await;
            return fail(&app, session_id, format!("Deepgram client: {e}"));
        }
    };
    let (model, lang) = model_language(&language);
    let options = Options::builder()
        .model(model)
        .language(lang)
        .multichannel(channels == 2)
        .diarize(true)
        .smart_format(true)
        .punctuate(true)
        .build();
    let results = dg
        .transcription()
        .stream_request_with_options(options)
        .encoding(Encoding::Linear16)
        .sample_rate(TARGET_SAMPLE_RATE)
        .channels(channels)
        .interim_results(true)
        .endpointing(Endpointing::CustomDurationMs(100))
        .keep_alive()
        .stream(audio_rx)
        .await;
    let mut results = match results {
        Ok(r) => r,
        Err(e) => {
            cancel.cancel();
            let _ = bridge.await;
            if let Some(m) = mic {
                m.stop();
            }
            sys.stop();
            return fail(&app, session_id, format!("Deepgram connect: {e}"));
        }
    };

    let _ = app.emit(
        events::SESSION_STATE,
        SessionState::new(Some(session_id), "recording").with_started(now()),
    );

    // Start the optional window video recording now that capture is live. Video
    // is best-effort: a failure here is logged but never blocks transcription.
    let recorder = match video_cfg {
        Some(cfg) => match video::start_window_recording(cfg) {
            Ok(r) => Some(r),
            Err(e) => {
                eprintln!("[session] video recording failed to start: {e}");
                None
            }
        },
        None => None,
    };

    // 4) Stream transcripts to the UI until stopped or the stream ends.
    loop {
        tokio::select! {
            _ = cancel.cancelled() => break,
            item = results.next() => match item {
                Some(Ok(resp)) => emit_transcript(&app, session_id, resp, system_only),
                Some(Err(e)) => {
                    let _ = app.emit(
                        events::SESSION_STATE,
                        SessionState::new(Some(session_id), "error").with_error(format!("stream: {e}")),
                    );
                }
                None => break,
            }
        }
    }

    // 5) Graceful teardown.
    cancel.cancel();
    if let Some(m) = mic {
        m.stop();
    }
    sys.stop();
    let _ = bridge.await;
    // Stop the video recording (finalizes the MP4) and persist its path BEFORE
    // finalize_session, so a recording with no transcript is still kept. The
    // stop joins the encoder's transcode thread, so run it off the async worker.
    if let Some(recorder) = recorder {
        match tokio::task::spawn_blocking(move || recorder.stop()).await {
            Ok(Ok(path)) => {
                if let Err(e) = app
                    .state::<Db>()
                    .set_video_path(session_id, &path.to_string_lossy())
                {
                    eprintln!("[session] db set_video_path: {e}");
                }
            }
            Ok(Err(e)) => eprintln!("[session] stop video recording: {e}"),
            Err(e) => eprintln!("[session] video stop task panicked: {e}"),
        }
    }
    // Persist the end time (or drop the row if nothing was transcribed).
    if let Err(e) = app.state::<Db>().finalize_session(session_id, &now()) {
        eprintln!("[session] db finalize: {e}");
    }
    let _ = app.emit(
        events::SESSION_STATE,
        SessionState::new(Some(session_id), "stopped"),
    );
}

fn fail(app: &AppHandle, session_id: i64, msg: String) {
    eprintln!("[session] {msg}");
    // No transcript was produced; drop the empty session row so it doesn't
    // clutter the history list.
    let _ = app.state::<Db>().finalize_session(session_id, &now());
    let _ = app.emit(
        events::SESSION_STATE,
        SessionState::new(Some(session_id), "error").with_error(msg),
    );
}

fn emit_transcript(app: &AppHandle, session_id: i64, resp: StreamResponse, system_only: bool) {
    let StreamResponse::TranscriptResponse {
        is_final,
        channel,
        channel_index,
        start,
        duration,
        ..
    } = resp
    else {
        return; // ignore Metadata / SpeechStarted / UtteranceEnd / Terminal
    };

    let ch = channel_index.first().copied().unwrap_or(0);
    // In system-only mode there is a single channel and it is the system audio.
    let source = if system_only || ch == 1 {
        "remote"
    } else {
        "you"
    };

    let Some(alt) = channel.alternatives.first() else {
        return;
    };
    let text = alt.transcript.trim();
    if text.is_empty() {
        return;
    }

    let speaker = if source == "you" {
        Some("You".to_string())
    } else {
        alt.words
            .first()
            .and_then(|w| w.speaker)
            .map(|s| format!("Speaker {}", s + 1))
    };

    let segment = TranscriptSegment {
        session_id,
        segment_id: format!("{session_id}:{ch}:{start:.2}"),
        source: source.to_string(),
        speaker,
        text: text.to_string(),
        t_start: start,
        t_end: Some(start + duration),
        is_final,
        confidence: Some(alt.confidence),
    };
    // Persist only finalized lines; interim results get replaced in place and
    // would otherwise churn / duplicate in storage.
    if segment.is_final {
        if let Err(e) = app.state::<Db>().upsert_segment(&segment) {
            eprintln!("[session] db upsert: {e}");
        }
    }
    let _ = app.emit(events::TRANSCRIPT_SEGMENT, segment);
}
