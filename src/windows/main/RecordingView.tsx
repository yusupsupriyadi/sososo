import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { HugeiconsIcon } from '@hugeicons/react';
import { useSession } from '../../hooks/useSession';
import { IconDrag, IconPause, IconPlay, IconStop } from '../../lib/icons';
import { speakerColor } from '../../lib/speaker';
import { useElapsedLabel } from '../../hooks/useElapsedTimer';
import { useTranscriptStore } from '../../state/transcriptStore';
import { useConfigStore } from '../../state/configStore';
import { enterRecordingWindow, exitRecordingWindow } from '../../lib/window';

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
  const transcriptScale = useConfigStore((s) => s.transcriptScale);
  const endRef = useRef<HTMLDivElement>(null);
  const last = segments[segments.length - 1];

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
  const status =
    state === 'starting' ? 'Starting…' : stopping ? 'Finishing…' : paused ? 'Paused' : 'Recording';

  return (
    <div className="flex h-screen w-screen flex-col items-center gap-2 p-2">
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
                : state === 'error'
                  ? 'bg-[#ffb454]'
                  : 'bg-fg-faint',
            )}
          />
          <span className="text-[12px] font-semibold text-fg-dim">{status}</span>
          <span className="ml-auto text-[12px] text-fg-dim tabular-nums">{elapsed}</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-[14px]">
          {segments.length === 0 ? (
            <p className="m-auto px-4 text-center text-[13px] text-fg-faint italic">
              {state === 'starting'
                ? 'Connecting to Deepgram…'
                : "Live transcript will appear here when there's audio."}
            </p>
          ) : (
            segments.map((c) => (
              <div key={c.segmentId} className="flex flex-col gap-0.5">
                <span
                  className="tracking-[0.05em] uppercase"
                  style={{
                    fontSize: `${11 * transcriptScale}px`,
                    color: speakerColor(c.source, c.speaker),
                  }}
                >
                  {c.speaker ?? (c.source === 'you' ? 'You' : 'Speaker')}
                </span>
                <span
                  className={clsx('leading-[1.5] text-fg', !c.isFinal && 'italic opacity-60')}
                  style={{ fontSize: `${14 * transcriptScale}px` }}
                >
                  {c.text}
                </span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {state === 'error' && error && (
          <p className="mx-3.5 mb-3 rounded-sm border border-[rgba(255,180,84,0.25)] bg-[rgba(255,180,84,0.1)] px-3 py-2 text-[12.5px] text-[#ffb454]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
