import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { useSession } from '../../../hooks/useSession';
import { useSessionStore } from '../../../state/sessionStore';
import { useConfigStore, type LanguageCode } from '../../../state/configStore';
import { hasApiKey, listDevices, setDevices, setTranscriptionOptions } from '../../../lib/ipc';
import type { DeviceLists } from '../../../types/domain';
import { LANGUAGES, TRANSLATE_TARGETS } from '../../../lib/languages';
import {
  IconAlert,
  IconKey,
  IconLanguage,
  IconMic,
  IconRecord,
  IconSettings,
  IconSpeaker,
  IconWave,
} from '../../../lib/icons';

const BIG_BTN_BASE =
  'inline-flex items-center justify-center gap-2 cursor-pointer rounded-full border px-[26px] py-[13px] text-[15px] font-semibold no-underline shadow-liquid transition duration-[120ms] active:scale-[0.98] disabled:cursor-default disabled:opacity-60';
const SELECT =
  'cursor-pointer rounded-sm border border-glass-border bg-[rgba(255,255,255,0.05)] px-[11px] py-[9px] text-[13px] text-fg outline-none focus:border-accent';

export default function LibraryRoute() {
  const { start } = useSession();
  const state = useSessionStore((s) => s.state);
  const error = useSessionStore((s) => s.error);

  const {
    language,
    systemOnly,
    inputDevice,
    outputDevice,
    translateEnabled,
    targetLanguage,
    setLanguage,
    setSystemOnly,
    setInputDevice,
    setOutputDevice,
    setTranslateEnabled,
    setTargetLanguage,
  } = useConfigStore();
  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [openaiReady, setOpenaiReady] = useState<boolean | null>(null);
  const [devices, setDeviceLists] = useState<DeviceLists | null>(null);

  useEffect(() => {
    hasApiKey('deepgram')
      .then(setKeyReady)
      .catch(() => setKeyReady(false));
    hasApiKey('openai')
      .then(setOpenaiReady)
      .catch(() => setOpenaiReady(false));
  }, [state]);

  // Load device lists once; seed defaults only if nothing is selected yet
  // (a choice made in Settings is shared via the config store).
  useEffect(() => {
    listDevices()
      .then((d) => {
        setDeviceLists(d);
        const cfg = useConfigStore.getState();
        if (cfg.inputDevice == null) {
          setInputDevice(d.input.find((x) => x.isDefault)?.id ?? d.input[0]?.id ?? null);
        }
        if (cfg.outputDevice == null) {
          setOutputDevice(d.output.find((x) => x.isDefault)?.id ?? d.output[0]?.id ?? null);
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
    setSystemOnly(e.target.value === 'system');
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
        <div className="mb-2 flex justify-center text-accent">
          <HugeiconsIcon icon={IconMic} size={46} strokeWidth={1.5} aria-hidden={true} />
        </div>
        <h2 className="mb-3.5 text-[20px] font-semibold text-fg">Start transcription</h2>

        {keyReady === false ? (
          <>
            <div className="mt-1 flex justify-center text-fg-faint">
              <HugeiconsIcon icon={IconKey} size={26} strokeWidth={1.5} aria-hidden={true} />
            </div>
            <p className="mx-auto mt-3.5 max-w-[360px] text-[13px] leading-[1.5] text-fg-faint">
              Deepgram API key isn't set. Set it first to start transcription.
            </p>
            <Link
              to="/main/settings"
              className={`${BIG_BTN_BASE} border-glass-border bg-[rgba(255,255,255,0.06)] text-fg hover:bg-hover`}
            >
              <HugeiconsIcon icon={IconSettings} size={18} strokeWidth={1.8} aria-hidden={true} />
              Open Settings
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto mb-5 flex max-w-[340px] flex-col gap-3 text-left">
              <label className="flex flex-col gap-[5px]">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-faint">
                  <HugeiconsIcon
                    icon={IconLanguage}
                    size={13}
                    strokeWidth={1.8}
                    aria-hidden={true}
                  />
                  Language
                </span>
                <select className={SELECT} value={language} onChange={onLanguage}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[5px]">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-faint">
                  <HugeiconsIcon icon={IconWave} size={13} strokeWidth={1.8} aria-hidden={true} />
                  Audio source
                </span>
                <select
                  className={SELECT}
                  value={systemOnly ? 'system' : 'both'}
                  onChange={onSource}
                >
                  <option value="both">System + Microphone (meeting)</option>
                  <option value="system">System only (video/music)</option>
                </select>
              </label>
              <label className="flex flex-col gap-[5px]">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-faint">
                  <HugeiconsIcon icon={IconMic} size={13} strokeWidth={1.8} aria-hidden={true} />
                  Microphone
                </span>
                <select className={SELECT} value={inputDevice ?? ''} onChange={onInput}>
                  {devices?.input.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-[5px]">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-faint">
                  <HugeiconsIcon
                    icon={IconSpeaker}
                    size={13}
                    strokeWidth={1.8}
                    aria-hidden={true}
                  />
                  System audio (speaker to capture)
                </span>
                <select className={SELECT} value={outputDevice ?? ''} onChange={onOutput}>
                  {devices?.output.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-0.5 flex flex-col gap-2 rounded-sm border border-glass-border bg-[rgba(255,255,255,0.03)] p-2.5">
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 cursor-pointer accent-[#6ea8fe]"
                    checked={translateEnabled}
                    onChange={(e) => setTranslateEnabled(e.target.checked)}
                  />
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-fg">
                    <HugeiconsIcon
                      icon={IconLanguage}
                      size={14}
                      strokeWidth={1.8}
                      aria-hidden={true}
                    />
                    Live translate (OpenAI)
                  </span>
                </label>
                {translateEnabled && (
                  <>
                    <label className="flex flex-col gap-[5px]">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-faint">
                        <HugeiconsIcon
                          icon={IconLanguage}
                          size={13}
                          strokeWidth={1.8}
                          aria-hidden={true}
                        />
                        Translate to
                      </span>
                      <select
                        className={SELECT}
                        value={targetLanguage}
                        onChange={(e) => setTargetLanguage(e.target.value as LanguageCode)}
                      >
                        {TRANSLATE_TARGETS.map((l) => (
                          <option key={l.code} value={l.code}>
                            {l.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {openaiReady === false && (
                      <p className="flex items-start gap-1.5 text-[12px] leading-[1.45] text-[#ffb454]">
                        <HugeiconsIcon
                          icon={IconAlert}
                          size={14}
                          strokeWidth={1.8}
                          className="mt-0.5 shrink-0"
                          aria-hidden={true}
                        />
                        <span>
                          OpenAI API key isn't set — add it in{' '}
                          <Link to="/main/settings" className="underline">
                            Settings
                          </Link>{' '}
                          to translate.
                        </span>
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <button
              className={`${BIG_BTN_BASE} border-[rgba(110,168,254,0.45)] bg-[rgba(110,168,254,0.2)] text-[#dbe8ff] hover:bg-[rgba(110,168,254,0.3)]`}
              onClick={() => void start()}
              disabled={state === 'starting'}
            >
              <HugeiconsIcon icon={IconRecord} size={17} strokeWidth={1.8} aria-hidden={true} />
              {state === 'starting' ? 'Starting…' : 'Start Transcription'}
            </button>
            <p className="mx-auto mt-3.5 max-w-[360px] text-[13px] leading-[1.5] text-fg-faint">
              When you start, this window turns into the live transcription view with <b>Pause</b> &{' '}
              <b>Finish</b> buttons on top. A specific language (e.g. English/Indonesian) is usually
              more accurate than Auto.
            </p>
          </>
        )}

        {state === 'error' && error && (
          <p className="mt-4 flex items-start gap-2 rounded-sm border border-[rgba(255,180,84,0.25)] bg-[rgba(255,180,84,0.1)] px-3 py-2 text-left text-[12.5px] text-[#ffb454]">
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
