import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../../hooks/useSession";
import { useSessionStore } from "../../../state/sessionStore";
import { useConfigStore, type LanguageCode } from "../../../state/configStore";
import {
  hasApiKey,
  listDevices,
  setDevices,
  setTranscriptionOptions,
} from "../../../lib/ipc";
import type { DeviceLists } from "../../../types/domain";
import { LANGUAGES } from "../../../lib/languages";

const BIG_BTN_BASE =
  "inline-block cursor-pointer rounded-full border px-[26px] py-[13px] text-[15px] font-semibold no-underline shadow-liquid transition duration-[120ms] active:scale-[0.98] disabled:cursor-default disabled:opacity-60";
const SELECT =
  "cursor-pointer rounded-sm border border-glass-border bg-[rgba(255,255,255,0.05)] px-[11px] py-[9px] text-[13px] text-fg outline-none focus:border-accent";

export default function LibraryRoute() {
  const { start } = useSession();
  const state = useSessionStore((s) => s.state);
  const error = useSessionStore((s) => s.error);

  const {
    language,
    systemOnly,
    inputDevice,
    outputDevice,
    setLanguage,
    setSystemOnly,
    setInputDevice,
    setOutputDevice,
  } = useConfigStore();
  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [devices, setDeviceLists] = useState<DeviceLists | null>(null);

  useEffect(() => {
    hasApiKey("deepgram")
      .then(setKeyReady)
      .catch(() => setKeyReady(false));
  }, [state]);

  // Load device lists once; seed defaults only if nothing is selected yet
  // (a choice made in Settings is shared via the config store).
  useEffect(() => {
    listDevices()
      .then((d) => {
        setDeviceLists(d);
        const cfg = useConfigStore.getState();
        if (cfg.inputDevice == null) {
          setInputDevice(
            d.input.find((x) => x.isDefault)?.id ?? d.input[0]?.id ?? null,
          );
        }
        if (cfg.outputDevice == null) {
          setOutputDevice(
            d.output.find((x) => x.isDefault)?.id ?? d.output[0]?.id ?? null,
          );
        }
      })
      .catch(() => {});
  }, [setInputDevice, setOutputDevice]);

  // Keep the backend in sync with the selected language / capture mode.
  useEffect(() => {
    void setTranscriptionOptions(language, systemOnly);
  }, [language, systemOnly]);

  // Keep the backend in sync with the selected input/output devices.
  useEffect(() => {
    void setDevices(inputDevice, outputDevice);
  }, [inputDevice, outputDevice]);

  function onLanguage(e: React.ChangeEvent<HTMLSelectElement>) {
    setLanguage(e.target.value as LanguageCode);
  }
  function onSource(e: React.ChangeEvent<HTMLSelectElement>) {
    setSystemOnly(e.target.value === "system");
  }
  function onInput(e: React.ChangeEvent<HTMLSelectElement>) {
    setInputDevice(e.target.value || null);
  }
  function onOutput(e: React.ChangeEvent<HTMLSelectElement>) {
    setOutputDevice(e.target.value || null);
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
              <label className="flex flex-col gap-[5px]">
                <span className="text-[12px] text-fg-faint">Microphone</span>
                <select
                  className={SELECT}
                  value={inputDevice ?? ""}
                  onChange={onInput}
                >
                  {devices?.input.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[5px]">
                <span className="text-[12px] text-fg-faint">
                  System audio (speaker to capture)
                </span>
                <select
                  className={SELECT}
                  value={outputDevice ?? ""}
                  onChange={onOutput}
                >
                  {devices?.output.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.isDefault ? " (default)" : ""}
                    </option>
                  ))}
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
