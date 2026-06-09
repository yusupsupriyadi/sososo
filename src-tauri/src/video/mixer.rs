//! Mixes the two 48 kHz / stereo audio streams that make up the video
//! recording's audio track — your microphone + the system (loopback) audio —
//! by summing them sample-for-sample into one interleaved stereo stream the
//! `windows-capture` encoder can mux.
//!
//! Both inputs are interleaved stereo (`L, R, L, R, …`) `i16` at the same 48 kHz
//! clock. On each drain we emit `max(len(mic), len(system))` samples, padding the
//! shorter side with silence (`0`) so **no captured audio is ever dropped** and
//! the emitted stream keeps pace with real time — this is essential because
//! WASAPI loopback delivers *nothing* during system silence, so the system side
//! routinely starves while the mic keeps flowing (mirrors the silence-padding in
//! [`crate::audio::mixer::Interleaver`]). Sums saturate to avoid `i16` wrap.

use std::collections::VecDeque;

/// Buffers and sums mic + system 48 kHz interleaved-stereo PCM for the video
/// encoder's audio track. See the module docs for the padding/saturation rules.
pub struct VideoAudioMixer {
    mic: VecDeque<i16>,
    system: VecDeque<i16>,
}

impl VideoAudioMixer {
    /// A new, empty mixer.
    pub fn new() -> Self {
        Self {
            mic: VecDeque::new(),
            system: VecDeque::new(),
        }
    }

    /// Append a chunk of microphone samples (interleaved stereo `i16`).
    pub fn push_mic(&mut self, samples: &[i16]) {
        self.mic.extend(samples.iter().copied());
    }

    /// Append a chunk of system/loopback samples (interleaved stereo `i16`).
    pub fn push_system(&mut self, samples: &[i16]) {
        self.system.extend(samples.iter().copied());
    }

    /// Drain everything buffered, summing mic + system into one interleaved
    /// stereo stream and returning it as little-endian bytes ready for
    /// `VideoEncoder::send_audio_buffer`. The shorter side is silence-padded so
    /// the longer side is never dropped. Returns an empty `Vec` when both
    /// buffers are empty (the caller then skips feeding audio for that frame).
    pub fn drain_mixed_bytes(&mut self) -> Vec<u8> {
        let n = self.mic.len().max(self.system.len());
        let mut out = Vec::with_capacity(n * 2);
        for _ in 0..n {
            let a = self.mic.pop_front().unwrap_or(0) as i32;
            let b = self.system.pop_front().unwrap_or(0) as i32;
            let mixed = (a + b).clamp(i16::MIN as i32, i16::MAX as i32) as i16;
            out.extend_from_slice(&mixed.to_le_bytes());
        }
        out
    }
}

impl Default for VideoAudioMixer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Decode LE bytes back to `i16` samples for assertions.
    fn samples(bytes: &[u8]) -> Vec<i16> {
        bytes
            .chunks_exact(2)
            .map(|c| i16::from_le_bytes([c[0], c[1]]))
            .collect()
    }

    #[test]
    fn empty_mixer_drains_to_nothing() {
        let mut m = VideoAudioMixer::new();
        assert!(m.drain_mixed_bytes().is_empty());
    }

    #[test]
    fn mic_only_is_passed_through_summed_with_silence() {
        let mut m = VideoAudioMixer::new();
        m.push_mic(&[10, -20, 30, -40]);
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![10, -20, 30, -40]);
    }

    #[test]
    fn system_only_is_passed_through_summed_with_silence() {
        let mut m = VideoAudioMixer::new();
        m.push_system(&[5, 6, 7, 8]);
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![5, 6, 7, 8]);
    }

    #[test]
    fn equal_length_streams_are_summed_elementwise() {
        let mut m = VideoAudioMixer::new();
        m.push_mic(&[100, 200, 300, 400]);
        m.push_system(&[1, 2, 3, 4]);
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![101, 202, 303, 404]);
    }

    #[test]
    fn sums_saturate_instead_of_wrapping() {
        let mut m = VideoAudioMixer::new();
        m.push_mic(&[i16::MAX, i16::MIN]);
        m.push_system(&[1, -1]);
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![i16::MAX, i16::MIN]);
    }

    #[test]
    fn shorter_side_is_silence_padded_so_longer_side_survives() {
        let mut m = VideoAudioMixer::new();
        m.push_mic(&[10, 20]);
        m.push_system(&[1, 2, 3, 4]);
        // First two sum; the remaining system samples mix with mic silence.
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![11, 22, 3, 4]);
    }

    #[test]
    fn draining_clears_the_buffers() {
        let mut m = VideoAudioMixer::new();
        m.push_mic(&[1, 2]);
        m.push_system(&[3, 4]);
        let _ = m.drain_mixed_bytes();
        assert!(m.drain_mixed_bytes().is_empty());
    }
}
