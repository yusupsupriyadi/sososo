import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { HugeiconsIcon } from '@hugeicons/react';
import { useSession } from '../../hooks/useSession';
import { useLiveTranslation } from '../../hooks/useLiveTranslation';
import {
  IconAlert,
  IconDrag,
  IconLanguage,
  IconMic,
  IconPause,
  IconPlay,
  IconRemote,
  IconStop,
  IconVideo,
} from '../../lib/icons';
import { speakerColor } from '../../lib/speaker';
import { useElapsedLabel } from '../../hooks/useElapsedTimer';
import { useTranscriptStore, type TranslationEntry } from '../../state/transcriptStore';
import { useConfigStore } from '../../state/configStore';
import { languageLabel, TRANSLATE_TARGETS } from '../../lib/languages';
import { enterRecordingWindow, exitRecordingWindow } from '../../lib/window';
import { isMacOS } from '../../lib/platform';
import { ConnectingState, FinishingState, ListeningState, LoadingDots } from './LiveStatusViews';
import { liveBodyState, sessionStatusLabel } from './recordingStatus';

const PILL_BTN =
  'inline-flex cursor-pointer items-center justify-center shadow-liquid transition duration-[120ms] enabled:hover:brightness-[1.12] enabled:active:scale-[0.92] disabled:cursor-default disabled:opacity-55';

/**
 * Compact floating transcription widget shown while a session is active. A small
 * pill on top carries just two icon buttons — yellow = pause/resume, red =
 * finish — above a transparent-glass panel holding the live transcript. On
 * mount the window shrinks to an always-on-top widget; on unmount it restores.
 */
export default function RecordingView() {
  const { state, error, paused, stop, togglePause } = useSession();
  const elapsed = useElapsedLabel();
  const segments = useTranscriptStore((s) => s.segments);
  const translations = useTranscriptStore((s) => s.translations);
  const transcriptScale = useConfigStore((s) => s.transcriptScale);
  const videoEnabled = useConfigStore((s) => s.videoEnabled);
  const translateEnabled = useConfigStore((s) => s.translateEnabled);
  const setTranslateEnabled = useConfigStore((s) => s.setTranslateEnabled);
  const targetLanguage = useConfigStore((s) => s.targetLanguage);
  const setTargetLanguage = useConfigStore((s) => s.setTargetLanguage);
  const endRef = useRef<HTMLDivElement>(null);
  const last = segments[segments.length - 1];

  // Translate finalized lines via OpenAI while recording (no-op when disabled).
  useLiveTranslation();

  useEffect(() => {
    void enterRecordingWindow();
    return () => {
      void exitRecordingWindow();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [segments.length, last?.text]);

  const stopping = state === 'stopping';
  const live = !paused && state === 'recording';
  const status = sessionStatusLabel(state, paused);
  const bodyState = liveBodyState(state, segments.length);

  return (
    <div
      // macOS shows native traffic lights (titleBarStyle "Overlay") even on the
      // shrunken widget, so add top padding to keep the pill clear of them.
      className={clsx(
        'flex h-screen w-screen flex-col items-center gap-2 px-2 pb-2',
        isMacOS ? 'pt-7' : 'pt-2',
      )}
    >
      <div className="liquid-glass inline-flex shrink-0 items-center gap-2.5 rounded-full px-3 py-[7px]">
        <button
          className={`${PILL_BTN} h-[30px] w-10 rounded-[9px] bg-[#f5c518] text-[#1b1b1b]`}
          onClick={() => void togglePause()}
          disabled={state !== 'recording'}
          title={paused ? 'Resume' : 'Pause'}
          aria-label={paused ? 'Resume' : 'Pause'}
        >
          <HugeiconsIcon
            icon={paused ? IconPlay : IconPause}
            size={16}
            strokeWidth={2.2}
            aria-hidden={true}
          />
        </button>
        <button
          className={`${PILL_BTN} h-8 w-8 rounded-full bg-rec text-white`}
          onClick={() => void stop()}
          disabled={stopping || state === 'starting'}
          title="Finish"
          aria-label="Finish"
        >
          <HugeiconsIcon icon={IconStop} size={15} strokeWidth={2.2} aria-hidden={true} />
        </button>
        <button
          className={`${PILL_BTN} h-[30px] w-9 rounded-[9px] ${
            translateEnabled
              ? 'bg-[rgba(110,168,254,0.9)] text-white'
              : 'bg-[rgba(255,255,255,0.08)] text-fg-faint'
          }`}
          onClick={() => setTranslateEnabled(!translateEnabled)}
          title={
            translateEnabled
              ? `Live translate: on → ${languageLabel(targetLanguage)}`
              : 'Live translate: off'
          }
          aria-label="Toggle live translate"
          aria-pressed={translateEnabled}
        >
          <HugeiconsIcon icon={IconLanguage} size={15} strokeWidth={2} aria-hidden={true} />
        </button>
        <span
          className="ml-0.5 inline-flex h-[30px] w-[22px] cursor-grab items-center justify-center rounded-[7px] text-fg-faint hover:bg-hover hover:text-fg-dim active:cursor-grabbing [&>svg]:pointer-events-none"
          data-tauri-drag-region
          title="Drag to move"
          aria-label="Drag to move"
        >
          <HugeiconsIcon icon={IconDrag} size={16} strokeWidth={1.5} aria-hidden={true} />
        </span>
      </div>

      <div className="liquid-glass flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg">
        <div
          className="flex items-center gap-2 border-b border-glass-border px-3.5 py-[9px]"
          data-tauri-drag-region
        >
          <span
            className={clsx(
              'h-[9px] w-[9px] shrink-0 rounded-full',
              live
                ? 'animate-rec-pulse bg-rec'
                : state === 'starting'
                  ? 'animate-pulse bg-accent'
                  : state === 'stopping' || state === 'reconnecting' || state === 'error'
                    ? 'animate-pulse bg-[#ffb454]'
                    : 'bg-fg-faint',
            )}
          />
          <span className="text-[12px] font-semibold text-fg-dim">{status}</span>
          {videoEnabled && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rec"
              title="Recording video"
            >
              <HugeiconsIcon icon={IconVideo} size={12} strokeWidth={2} aria-hidden={true} />
              REC
            </span>
          )}
          <span className="ml-auto text-[12px] text-fg-dim tabular-nums">{elapsed}</span>
        </div>

        {translateEnabled && (
          <div className="flex items-center gap-2 border-b border-glass-border px-3.5 py-2">
            <span className="shrink-0 text-[12px] text-fg-faint">Translate to</span>
            <select
              className="flex-1 cursor-pointer truncate rounded-sm border border-glass-border bg-[rgba(255,255,255,0.06)] px-2.5 py-[7px] text-[13px] text-fg outline-none focus:border-accent"
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              title="Translate to"
              aria-label="Translation target language"
            >
              {TRANSLATE_TARGETS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-[14px]">
          {bodyState === 'connecting' ? (
            <ConnectingState />
          ) : bodyState === 'reconnecting' ? (
            <ConnectingState variant="reconnecting" />
          ) : bodyState === 'finishing' ? (
            <FinishingState />
          ) : bodyState === 'listening' ? (
            <ListeningState />
          ) : (
            segments.map((c) => (
              <div key={c.segmentId} className="flex flex-col gap-0.5">
                <span
                  className="inline-flex items-center gap-1 tracking-[0.05em] uppercase"
                  style={{
                    fontSize: `${11 * transcriptScale}px`,
                    color: speakerColor(c.source, c.speaker),
                  }}
                >
                  <HugeiconsIcon
                    icon={c.source === 'you' ? IconMic : IconRemote}
                    size={Math.round(12 * transcriptScale)}
                    strokeWidth={2}
                    aria-hidden={true}
                  />
                  {c.speaker ?? (c.source === 'you' ? 'You' : 'Speaker')}
                </span>
                <span
                  className={clsx('leading-[1.5] text-fg', !c.isFinal && 'italic opacity-60')}
                  style={{ fontSize: `${14 * transcriptScale}px` }}
                >
                  {c.text}
                </span>
                {translateEnabled && (
                  <TranslationLine entry={translations[c.segmentId]} scale={transcriptScale} />
                )}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {state === 'error' && error && (
          <p className="mx-3.5 mb-3 flex items-start gap-2 rounded-sm border border-[rgba(255,180,84,0.25)] bg-[rgba(255,180,84,0.1)] px-3 py-2 text-[12.5px] text-[#ffb454]">
            <HugeiconsIcon
              icon={IconAlert}
              size={15}
              strokeWidth={1.8}
              className="mt-px shrink-0"
              aria-hidden={true}
            />
            <span>{error}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Renders a segment's live translation beneath the original line (never
 * replacing it): an amber (yellow→orange) line when done, a faint "Translating…"
 * placeholder while pending, and nothing on error.
 */
function TranslationLine({ entry, scale }: { entry?: TranslationEntry; scale: number }) {
  if (!entry) return null;
  if (entry.status === 'pending') {
    return (
      <span
        className="inline-flex w-fit items-center gap-1.5 border-l-2 border-[rgba(255,192,77,0.35)] pl-2 text-[#ffc04d]/70 italic"
        style={{ fontSize: `${12 * scale}px` }}
      >
        Translating
        <LoadingDots />
      </span>
    );
  }
  if (entry.status === 'done' && entry.text) {
    return (
      <span
        className="border-l-2 border-[rgba(255,192,77,0.55)] pl-2 text-[#ffc04d]"
        style={{ fontSize: `${13 * scale}px` }}
      >
        {entry.text}
      </span>
    );
  }
  return null;
}
