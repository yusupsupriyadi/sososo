//! Linux capture backend (PulseAudio / PipeWire via libpulse-simple).
//!
//! Unlike macOS, Linux has an always-available way to capture system audio: every
//! output sink exposes a `.monitor` source. The mic is recorded from its source and
//! "system audio" from the default sink's monitor (or a user-picked monitor) — no
//! virtual loopback device to install. PulseAudio converts to our target format
//! server-side, so — like WASAPI `autoconvert` — we ask for 16 kHz / 16-bit / mono
//! and get it directly, with no downmix/resample needed. Works on PipeWire via its
//! PulseAudio-compatibility layer.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crossbeam_channel::Sender;
use psimple::Simple;
use pulse::sample::{Format, Spec};
use pulse::stream::Direction;

use super::Source;
use crate::audio::{pulse as pa, TARGET_CHANNELS, TARGET_SAMPLE_RATE};
use crate::error::{AppError, AppResult};

// Pull ~40 ms per blocking read so we re-check the stop flag promptly. A monitor
// source delivers silence (not nothing) while idle, so reads return on time. At
// 16 kHz mono that's 640 frames = 1280 bytes (i16 little-endian).
const READ_FRAMES: usize = (TARGET_SAMPLE_RATE as usize) / 25;
const READ_BYTES: usize = READ_FRAMES * 2;

pub(super) fn capture_loop(
    source: Source,
    device_id: Option<String>,
    tx: Sender<Vec<i16>>,
    stop: Arc<AtomicBool>,
) -> AppResult<()> {
    // Resolve the PA source name to record from. Mic: the selected source (or PA's
    // default source when None). Loopback: the selected sink monitor, or the default
    // sink's monitor when None.
    let device: Option<String> = match (source, device_id) {
        (Source::Mic, dev) => dev,
        (Source::Loopback, Some(dev)) => Some(dev),
        (Source::Loopback, None) => Some(pa::default_monitor_source()?),
    };

    let spec = Spec {
        format: Format::S16le,
        channels: TARGET_CHANNELS as u8,
        rate: TARGET_SAMPLE_RATE,
    };
    if !spec.is_valid() {
        return Err(AppError::Audio("pulse: invalid sample spec".into()));
    }

    let stream = Simple::new(
        None,              // default server
        "sososo",          // application name
        Direction::Record, // capture
        device.as_deref(), // source name (None => default source)
        match source {
            Source::Mic => "microphone",
            Source::Loopback => "system audio",
        },
        &spec,
        None, // default channel map
        None, // default buffering attributes
    )
    .map_err(|e| AppError::Audio(format!("pulse: open record stream ({source:?}): {e}")))?;

    let mut bytes = [0u8; READ_BYTES];
    while !stop.load(Ordering::Relaxed) {
        // Blocking read of a fixed small chunk; returns once the buffer is full.
        stream
            .read(&mut bytes)
            .map_err(|e| AppError::Audio(format!("pulse: read ({source:?}): {e}")))?;

        let mut samples = Vec::with_capacity(READ_FRAMES);
        for frame in bytes.as_chunks::<2>().0 {
            samples.push(i16::from_le_bytes(*frame));
        }
        // Non-blocking: drop if the consumer is far behind (favor fresh audio).
        let _ = tx.try_send(samples);
    }

    Ok(())
}
