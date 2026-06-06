import { useEffect } from 'react';
import { useTranscriptStore } from '../state/transcriptStore';
import { useConfigStore } from '../state/configStore';
import { languageLabel } from '../lib/languages';
import { translateSegment } from '../lib/ipc';

/**
 * Drives live, per-segment translation of finalized transcript lines via OpenAI.
 *
 * For each `isFinal` segment, when translation is enabled and the line hasn't
 * already been translated for the current target language, it marks the segment
 * `pending` *synchronously* (so a re-render can't dispatch it twice), calls the
 * backend `translate_segment` command, then stores the result. Interim lines are
 * ignored and already-translated lines are skipped — so a line is never
 * re-translated. Mount once (from `RecordingView`).
 */
export function useLiveTranslation(): void {
  const segments = useTranscriptStore((s) => s.segments);
  const translateEnabled = useConfigStore((s) => s.translateEnabled);
  const targetLanguage = useConfigStore((s) => s.targetLanguage);

  useEffect(() => {
    if (!translateEnabled) return;

    const targetName = languageLabel(targetLanguage);
    // Snapshot the cache once; segmentIds are unique within `segments`, so a
    // stale read can't cause a same-segment double-dispatch within this pass.
    const { translations, setTranslation } = useTranscriptStore.getState();

    for (const seg of segments) {
      if (!seg.isFinal) continue;
      const text = seg.text.trim();
      if (!text) continue;

      const existing = translations[seg.segmentId];
      // Already done / in-flight for this exact text + language → skip (the
      // core anti-duplication guarantee). Retry only on a previous error.
      if (
        existing &&
        existing.forText === text &&
        existing.lang === targetName &&
        existing.status !== 'error'
      ) {
        continue;
      }

      // Mark pending synchronously so the next render won't re-dispatch it.
      setTranslation(seg.segmentId, { status: 'pending', forText: text, lang: targetName });

      const { sessionId, segmentId } = seg;
      translateSegment(sessionId, segmentId, text, targetName)
        .then((translated) => {
          // Ignore a stale response if a newer text superseded this request.
          const cur = useTranscriptStore.getState().translations[segmentId];
          if (cur && cur.forText !== text) return;
          useTranscriptStore.getState().setTranslation(segmentId, {
            status: 'done',
            text: translated,
            forText: text,
            lang: targetName,
          });
        })
        .catch(() => {
          const cur = useTranscriptStore.getState().translations[segmentId];
          if (cur && cur.forText !== text) return;
          useTranscriptStore
            .getState()
            .setTranslation(segmentId, { status: 'error', forText: text, lang: targetName });
        });
    }
  }, [segments, translateEnabled, targetLanguage]);
}
