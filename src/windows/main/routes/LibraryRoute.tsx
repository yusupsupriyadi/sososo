import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../../hooks/useSession";
import { useSessionStore } from "../../../state/sessionStore";
import { useConfigStore, type LanguageCode } from "../../../state/configStore";
import { hasApiKey, setTranscriptionOptions } from "../../../lib/ipc";
import { LANGUAGES } from "../../../lib/languages";

const BIG_BTN_BASE =
  "inline-block cursor-pointer rounded-full border px-[26px] py-[13px] text-[15px] font-semibold no-underline shadow-liquid transition duration-[120ms] active:scale-[0.98] disabled:cursor-default disabled:opacity-60";
const SELECT =
  "cursor-pointer rounded-sm border border-glass-border bg-[rgba(255,255,255,0.05)] px-[11px] py-[9px] text-[13px] text-fg outline-none focus:border-accent";

export default function LibraryRoute() {
  const { start } = useSession();
  const state = useSessionStore((s) => s.state);
  const error = useSessionStore((s) => s.error);

  const { language, systemOnly, setLanguage, setSystemOnly } = useConfigStore();
  const [keyReady, setKeyReady] = useState<boolean | null>(null);

  useEffect(() => {
    hasApiKey("deepgram")
      .then(setKeyReady)
      .catch(() => setKeyReady(false));
  }, [state]);

  // Keep the backend in sync with the selected language / capture mode.
  useEffect(() => {
    void setTranscriptionOptions(language, systemOnly);
  }, [language, systemOnly]);

  function onLanguage(e: React.ChangeEvent<HTMLSelectElement>) {
    setLanguage(e.target.value as LanguageCode);
  }
  function onSource(e: React.ChangeEvent<HTMLSelectElement>) {
    setSystemOnly(e.target.value === "system");
  }

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-[440px] text-center text-fg-dim">
        <div className="mb-2 text-[44px]">🎙️</div>
        <h2 className="mb-3.5 text-[20px] font-semibold text-fg">
          Start transcription
        </h2>

        {keyReady === false ? (
          <>
            <p className="mx-auto mt-3.5 max-w-[360px] text-[13px] leading-[1.5] text-fg-faint">
              Deepgram API key isn't set. Set it first to start transcription.
            </p>
            <Link
              to="/main/settings"
              className={`${BIG_BTN_BASE} border-glass-border bg-[rgba(255,255,255,0.06)] text-fg hover:bg-hover`}
            >
              ⚙ Open Settings
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex max-w-[340px] flex-col gap-3 text-left">
              <label className="flex flex-col gap-[5px]">
                <span className="text-[12px] text-fg-faint">Language</span>
                <select className={SELECT} value={language} onChange={onLanguage}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[5px]">
                <span className="text-[12px] text-fg-faint">Audio source</span>
                <select
                  className={SELECT}
                  value={systemOnly ? "system" : "both"}
                  onChange={onSource}
                >
                  <option value="both">System + Microphone (meeting)</option>
                  <option value="system">System only (video/music)</option>
                </select>
              </label>
            </div>

            <button
              className={`${BIG_BTN_BASE} border-[rgba(110,168,254,0.45)] bg-[rgba(110,168,254,0.2)] text-[#dbe8ff] hover:bg-[rgba(110,168,254,0.3)]`}
              onClick={() => void start()}
              disabled={state === "starting"}
            >
              ● {state === "starting" ? "Starting…" : "Start Transcription"}
            </button>
            <p className="mx-auto mt-3.5 max-w-[360px] text-[13px] leading-[1.5] text-fg-faint">
              When you start, this window turns into the live transcription view
              with <b>Pause</b> & <b>Finish</b> buttons on top. A specific language
              (e.g. English/Indonesian) is usually more accurate than Auto.
            </p>
          </>
        )}

        {state === "error" && error && (
          <p className="mt-4 rounded-sm border border-[rgba(255,180,84,0.25)] bg-[rgba(255,180,84,0.1)] px-3 py-2 text-[12.5px] text-[#ffb454]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
