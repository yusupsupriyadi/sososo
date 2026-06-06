import { useEffect, useRef } from "react";
import clsx from "clsx";
import { useSession } from "../../hooks/useSession";
import { useElapsedLabel } from "../../hooks/useElapsedTimer";
import { useTranscriptStore } from "../../state/transcriptStore";
import { enterRecordingWindow, exitRecordingWindow } from "../../lib/window";

const PILL_BTN =
  "inline-flex cursor-pointer items-center justify-center shadow-liquid transition duration-[120ms] enabled:hover:brightness-[1.12] enabled:active:scale-[0.92] disabled:cursor-default disabled:opacity-55";

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
  const endRef = useRef<HTMLDivElement>(null);
  const last = segments[segments.length - 1];

  useEffect(() => {
    void enterRecordingWindow();
    return () => {
      void exitRecordingWindow();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [segments.length, last?.text]);

  const stopping = state === "stopping";
  const live = !paused && state === "recording";
  const status =
    state === "starting"
      ? "Starting…"
      : stopping
        ? "Finishing…"
        : paused
          ? "Paused"
          : "Recording";

  return (
    <div className="flex h-screen w-screen flex-col items-center gap-2 p-2">
      <div className="inline-flex shrink-0 items-center gap-2.5 rounded-full liquid-glass px-3 py-[7px]">
        <button
          className={`${PILL_BTN} h-[30px] w-10 rounded-[9px] bg-[#f5c518] text-[#1b1b1b]`}
          onClick={() => void togglePause()}
          disabled={state !== "recording"}
          title={paused ? "Resume" : "Pause"}
          aria-label={paused ? "Resume" : "Pause"}
        >
          {paused ? (
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <path d="M3 2l9 5-9 5z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
              <rect x="2.5" y="2" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="8.5" y="2" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
          )}
        </button>
        <button
          className={`${PILL_BTN} h-8 w-8 rounded-full bg-rec text-white`}
          onClick={() => void stop()}
          disabled={stopping || state === "starting"}
          title="Finish"
          aria-label="Finish"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" />
          </svg>
        </button>
        <span
          className="ml-0.5 inline-flex h-[30px] w-[22px] cursor-grab items-center justify-center rounded-[7px] text-fg-faint hover:bg-hover hover:text-fg-dim active:cursor-grabbing [&>svg]:pointer-events-none"
          data-tauri-drag-region
          title="Drag to move"
          aria-label="Drag to move"
        >
          <svg viewBox="0 0 12 16" width="12" height="16" aria-hidden="true">
            <circle cx="3.5" cy="3" r="1.25" fill="currentColor" />
            <circle cx="8.5" cy="3" r="1.25" fill="currentColor" />
            <circle cx="3.5" cy="8" r="1.25" fill="currentColor" />
            <circle cx="8.5" cy="8" r="1.25" fill="currentColor" />
            <circle cx="3.5" cy="13" r="1.25" fill="currentColor" />
            <circle cx="8.5" cy="13" r="1.25" fill="currentColor" />
          </svg>
        </span>
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg liquid-glass">
        <div
          className="flex items-center gap-2 border-b border-glass-border px-3.5 py-[9px]"
          data-tauri-drag-region
        >
          <span
            className={clsx(
              "h-[9px] w-[9px] shrink-0 rounded-full",
              live
                ? "animate-rec-pulse bg-rec"
                : state === "error"
                  ? "bg-[#ffb454]"
                  : "bg-fg-faint",
            )}
          />
          <span className="text-[12px] font-semibold text-fg-dim">{status}</span>
          <span className="ml-auto text-[12px] tabular-nums text-fg-dim">
            {elapsed}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-[14px]">
          {segments.length === 0 ? (
            <p className="m-auto px-4 text-center text-[13px] italic text-fg-faint">
              {state === "starting"
                ? "Connecting to Deepgram…"
                : "Live transcript will appear here when there's audio."}
            </p>
          ) : (
            segments.map((c) => (
              <div key={c.segmentId} className="flex flex-col gap-0.5">
                <span
                  className={clsx(
                    "text-[11px] uppercase tracking-[0.05em]",
                    c.source === "you"
                      ? "text-accent"
                      : c.source === "remote"
                        ? "text-accent-2"
                        : "text-fg-faint",
                  )}
                >
                  {c.speaker ?? (c.source === "you" ? "You" : "Speaker")}
                </span>
                <span
                  className={clsx(
                    "text-[14px] leading-[1.5] text-fg",
                    !c.isFinal && "italic opacity-60",
                  )}
                >
                  {c.text}
                </span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {state === "error" && error && (
          <p className="mx-3.5 mb-3 rounded-sm border border-[rgba(255,180,84,0.25)] bg-[rgba(255,180,84,0.1)] px-3 py-2 text-[12.5px] text-[#ffb454]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
