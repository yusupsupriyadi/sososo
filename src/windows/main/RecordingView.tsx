import { useEffect, useRef } from "react";
import clsx from "clsx";
import { useSession } from "../../hooks/useSession";
import { useElapsedLabel } from "../../hooks/useElapsedTimer";
import { useTranscriptStore } from "../../state/transcriptStore";
import { enterRecordingWindow, exitRecordingWindow } from "../../lib/window";

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
  const status =
    state === "starting"
      ? "Menyiapkan…"
      : stopping
        ? "Menyelesaikan…"
        : paused
          ? "Dijeda"
          : "Merekam";

  return (
    <div className="flex h-screen w-screen flex-col items-center gap-2 p-2">
      <div className="rec-pill">
        <button
          className="rec-pause"
          onClick={() => void togglePause()}
          disabled={state !== "recording"}
          title={paused ? "Lanjutkan" : "Jeda"}
          aria-label={paused ? "Lanjutkan" : "Jeda"}
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
          className="rec-end"
          onClick={() => void stop()}
          disabled={stopping || state === "starting"}
          title="Selesai"
          aria-label="Selesai"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <rect x="1.5" y="1.5" width="9" height="9" rx="2" fill="currentColor" />
          </svg>
        </button>
        <span
          className="rec-drag"
          data-tauri-drag-region
          title="Geser untuk memindahkan"
          aria-label="Geser untuk memindahkan"
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

      <div className="rec-panel glass">
        <div className="rec-panel-head" data-tauri-drag-region>
          <span
            className={clsx(
              "rec-dot",
              !paused && state === "recording" && "is-live",
              state === "error" && "is-error",
            )}
          />
          <span className="rec-state">{status}</span>
          <span className="rec-timer">{elapsed}</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-[14px]">
          {segments.length === 0 ? (
            <p className="rec-hint">
              {state === "starting"
                ? "Menyambungkan ke Deepgram…"
                : "Transkrip langsung akan muncul di sini saat ada suara."}
            </p>
          ) : (
            segments.map((c) => (
              <div
                key={c.segmentId}
                className={clsx("caption", c.source, !c.isFinal && "interim")}
              >
                <span className="speaker">
                  {c.speaker ?? (c.source === "you" ? "You" : "Speaker")}
                </span>
                <span className="caption-text">{c.text}</span>
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>

        {state === "error" && error && <p className="rec-error">{error}</p>}
      </div>
    </div>
  );
}
