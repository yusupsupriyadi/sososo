//! Mixes the two 48 kHz / stereo audio streams that make up the video
//! recording's audio track — your microphone + the system (loopback) audio —
//! by **summing** them into one interleaved stereo stream the `windows-capture`
//! encoder can mux.
//!
//! Both inputs are interleaved stereo (`L, R, L, R, …`) `i16` at 48 kHz, but the
//! two WASAPI endpoints run on **independent clocks** and never have exactly the
//! same number of buffered samples at a given moment (poll jitter + drift). So,
//! exactly like [`crate::audio::mixer::Interleaver`], we only pair-and-sum the
//! `min` of the two buffers each drain and keep the remainder for next time —
//! padding a channel with silence **only** once it falls behind by more than
//! `max_skew` (e.g. WASAPI loopback delivers nothing during system silence).
//! Forcing both to the same length every tick (the naive approach) splices
//! silence on normal jitter and crackles. Work happens on whole stereo frames so
//! L/R never desync, and sums saturate to avoid `i16` wrap.

use std::collections::VecDeque;

/// Buffers and sums mic + system 48 kHz interleaved-stereo PCM for the video
/// encoder's audio track. See the module docs for the pairing/skew/saturation
/// rules.
pub struct VideoAudioMixer {
    mic: VecDeque<i16>,
    system: VecDeque<i16>,
    /// Max lead (in samples) one side may have before the other is silence-padded.
    /// Kept even so padding stays on stereo-frame boundaries.
    max_skew: usize,
}

impl VideoAudioMixer {
    /// `max_skew_samples` bounds how far the two clocks may drift before the
    /// starved side is padded with silence (rounded down to an even count).
    pub fn new(max_skew_samples: usize) -> Self {
        Self {
            mic: VecDeque::new(),
            system: VecDeque::new(),
            max_skew: max_skew_samples & !1,
        }
    }

    /// Append a chunk of microphone samples (interleaved stereo `i16`).
    pub fn push_mic(&mut self, samples: &[i16]) {
        self.mic.extend(samples.iter().copied());
        self.bound_skew();
    }

    /// Append a chunk of system/loopback samples (interleaved stereo `i16`).
    pub fn push_system(&mut self, samples: &[i16]) {
        self.system.extend(samples.iter().copied());
        self.bound_skew();
    }

    /// If one side has raced more than `max_skew` ahead of the other (e.g. the
    /// system is silent so loopback delivers nothing), pad the starved side with
    /// silence so its real audio stays time-aligned instead of drifting forever.
    /// Pads in even amounts to preserve stereo-frame alignment.
    fn bound_skew(&mut self) {
        if self.mic.len() > self.system.len() + self.max_skew {
            let pad = (self.mic.len() - self.system.len() - self.max_skew) & !1;
            self.system.extend(std::iter::repeat_n(0, pad));
        } else if self.system.len() > self.mic.len() + self.max_skew {
            let pad = (self.system.len() - self.mic.len() - self.max_skew) & !1;
            self.mic.extend(std::iter::repeat_n(0, pad));
        }
    }

    /// Drain all currently-pairable stereo frames, summing mic + system
    /// (saturating), and return them as little-endian bytes ready for
    /// `VideoEncoder::send_audio_buffer`. Unpaired tail samples stay buffered for
    /// the next call. Returns an empty `Vec` when nothing is pairable yet.
    pub fn drain_mixed_bytes(&mut self) -> Vec<u8> {
        // Whole stereo frames only, so L/R never desync.
        let n = self.mic.len().min(self.system.len()) & !1;
        let mut out = Vec::with_capacity(n * 2);
        for _ in 0..n {
            let a = self.mic.pop_front().unwrap() as i32;
            let b = self.system.pop_front().unwrap() as i32;
            let mixed = (a + b).clamp(i16::MIN as i32, i16::MAX as i32) as i16;
            out.extend_from_slice(&mixed.to_le_bytes());
        }
        out
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
        let mut m = VideoAudioMixer::new(1024);
        assert!(m.drain_mixed_bytes().is_empty());
    }

    #[test]
    fn equal_length_streams_are_summed_elementwise() {
        let mut m = VideoAudioMixer::new(1024);
        m.push_mic(&[100, 200, 300, 400]);
        m.push_system(&[1, 2, 3, 4]);
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![101, 202, 303, 404]);
    }

    #[test]
    fn sums_saturate_instead_of_wrapping() {
        let mut m = VideoAudioMixer::new(1024);
        m.push_mic(&[i16::MAX, i16::MIN]);
        m.push_system(&[1, -1]);
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![i16::MAX, i16::MIN]);
    }

    #[test]
    fn drains_only_paired_frames_and_keeps_the_remainder() {
        // Within max_skew: only the paired part is summed now; the extra mic
        // samples wait for the system to catch up (no silence splicing).
        let mut m = VideoAudioMixer::new(1024);
        m.push_mic(&[1, 2, 3, 4]);
        m.push_system(&[10, 20]);
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![11, 22]);
        m.push_system(&[30, 40]);
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![33, 44]);
    }

    #[test]
    fn draining_clears_paired_and_leaves_no_residue_when_balanced() {
        let mut m = VideoAudioMixer::new(1024);
        m.push_mic(&[1, 2]);
        m.push_system(&[3, 4]);
        let _ = m.drain_mixed_bytes();
        assert!(m.drain_mixed_bytes().is_empty());
    }

    #[test]
    fn pads_starved_system_with_silence_past_max_skew() {
        // System idle while mic races ahead → system padded so the mic still
        // drains (you hear the mic over system silence), bounded to max_skew.
        let mut m = VideoAudioMixer::new(2);
        m.push_mic(&[1, 2, 3, 4, 5, 6]); // pad system by 6-0-2=4 → 4 samples drain
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![1, 2, 3, 4]);
    }

    #[test]
    fn pads_starved_mic_with_silence_past_max_skew() {
        let mut m = VideoAudioMixer::new(2);
        m.push_system(&[10, 20, 30, 40, 50, 60]);
        assert_eq!(samples(&m.drain_mixed_bytes()), vec![10, 20, 30, 40]);
    }
}
