import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { useSession } from '../../../hooks/useSession';
import { useSessionStore } from '../../../state/sessionStore';
import { useConfigStore, type LanguageCode } from '../../../state/configStore';
import {
  hasApiKey,
  listDevices,
  listWindows,
  setDevices,
  setTranscriptionOptions,
  setVideoOptions,
} from '../../../lib/ipc';
import type { DeviceLists, WindowInfo } from '../../../types/domain';
import { LANGUAGES, TRANSLATE_TARGETS } from '../../../lib/languages';
import { isLinux } from '../../../lib/platform';
import {
  IconAbout,
  IconAlert,
  IconKey,
  IconLanguage,
  IconMic,
  IconRecord,
  IconRegenerate,
  IconRemote,
  IconRename,
  IconSettings,
  IconSpeaker,
  IconVideo,
  IconWave,
  IconWindow,
} from '../../../lib/icons';

/** Video recording: Windows (WGC) + macOS (ScreenCaptureKit). Not yet on Linux. */
const VIDEO_SUPPORTED = !isLinux;

const BIG_BTN_BASE =
  'inline-flex items-center justify-center gap-2 cursor-pointer rounded-full border px-[26px] py-[13px] text-[15px] font-semibold no-underline shadow-liquid transition duration-[120ms] active:scale-[0.98] disabled:cursor-default disabled:opacity-60';
const SELECT =
  'cursor-pointer rounded-sm border border-glass-border bg-[rgba(255,255,255,0.05)] px-[11px] py-[9px] text-[13px] text-fg outline-none focus:border-accent';

/** The two capture modes, shown on the Start screen as an icon toggle instead
 *  of a dropdown — fewer clicks and a clearer picture of what gets captured. */
const AUDIO_SOURCES: {
  systemOnly: boolean;
  icon: typeof IconMic;
  label: string;
  sublabel: string;
  hint: string;
}[] = [
  {
    systemOnly: false,
    icon: IconRemote,
    label: 'Meeting',
    sublabel: 'System + Mic',
    hint: 'Capture system audio and your microphone — best for meetings and calls.',
  },
  {
    systemOnly: true,
    icon: IconSpeaker,
    label: 'System only',
    sublabel: 'Video / music',
    hint: 'Capture system audio only — best for videos, music, and podcasts.',
  },
];

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
    videoEnabled,
    videoWindowId,
    setLanguage,
    setSystemOnly,
    setInputDevice,
    setOutputDevice,
    setTranslateEnabled,
    setTargetLanguage,
    setVideoEnabled,
    setVideoWindowId,
  } = useConfigStore();
  const [keyReady, setKeyReady] = useState<boolean | null>(null);
  const [openaiReady, setOpenaiReady] = useState<boolean | null>(null);
  const [devices, setDeviceLists] = useState<DeviceLists | null>(null);
  const [windows, setWindows] = useState<WindowInfo[]>([]);
  const [title, setTitle] = useState('');

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

  // Keep the backend in sync with the video-recording choice (Windows only).
  // Send "" (not null) for an unset window so the backend clears any prior pick.
  useEffect(() => {
    if (!VIDEO_SUPPORTED) return;
    void setVideoOptions(videoEnabled, videoWindowId ?? '');
  }, [videoEnabled, videoWindowId]);

  // (Re)load the capturable window list whenever recording is switched on.
  useEffect(() => {
    if (!VIDEO_SUPPORTED || !videoEnabled) return;
    refreshWindows();
  }, [videoEnabled]);

  function refreshWindows() {
    listWindows()
      .then(setWindows)
      .catch(() => setWindows([]));
  }

  function onLanguage(e: React.ChangeEvent<HTMLSelectElement>) {
    setLanguage(e.target.value as LanguageCode);
  }
  function onInput(e: React.ChangeEvent<HTMLSelectElement>) {
    setInputDevice(e.target.value || null);
  }
  function onOutput(e: React.ChangeEvent<HTMLSelectElement>) {
    setOutputDevice(e.target.value || null);
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-[480px] text-center text-fg-dim">
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
            <div className="mx-auto mb-5 flex max-w-[440px] flex-col gap-3 text-left">
              <label className="flex flex-col gap-[5px]">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-faint">
                  <HugeiconsIcon icon={IconRename} size={13} strokeWidth={1.8} aria-hidden={true} />
                  Session title (optional)
                </span>
                <input
                  type="text"
                  className="rounded-sm border border-glass-border bg-[rgba(255,255,255,0.05)] px-[11px] py-[9px] text-[13px] text-fg outline-none placeholder:text-fg-faint focus:border-accent"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Weekly sync"
                  maxLength={120}
                />
              </label>
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
                <span className="inline-flex items-center gap-1 text-[11px] leading-snug whitespace-nowrap text-fg-faint">
                  <HugeiconsIcon
                    icon={IconAbout}
                    size={12}
                    strokeWidth={1.8}
                    className="shrink-0"
                    aria-hidden={true}
                  />
                  <span>Tip: a specific language (e.g. English) is more accurate than Auto.</span>
                </span>
              </label>
              <div className="flex flex-col gap-[5px]">
                <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-faint">
                  <HugeiconsIcon icon={IconWave} size={13} strokeWidth={1.8} aria-hidden={true} />
                  Audio source
                </span>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Audio source">
                  {AUDIO_SOURCES.map((src) => {
                    const active = systemOnly === src.systemOnly;
                    return (
                      <button
                        key={src.label}
                        type="button"
                        onClick={() => setSystemOnly(src.systemOnly)}
                        aria-pressed={active}
                        title={src.hint}
                        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-sm border px-2 py-3 text-center transition duration-[120ms] active:scale-[0.98] ${
                          active
                            ? 'border-[rgba(110,168,254,0.45)] bg-[rgba(110,168,254,0.2)] text-[#dbe8ff] shadow-liquid'
                            : 'border-glass-border bg-[rgba(255,255,255,0.04)] text-fg-faint hover:bg-hover'
                        }`}
                      >
                        <HugeiconsIcon
                          icon={src.icon}
                          size={22}
                          strokeWidth={1.7}
                          aria-hidden={true}
                        />
                        <span className="text-[12.5px] leading-none font-semibold">
                          {src.label}
                        </span>
                        <span className="text-[10.5px] leading-tight opacity-80">
                          {src.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
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

              {VIDEO_SUPPORTED && (
                <div className="mt-0.5 flex flex-col gap-2 rounded-sm border border-glass-border bg-[rgba(255,255,255,0.03)] p-2.5">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 cursor-pointer accent-[#6ea8fe]"
                      checked={videoEnabled}
                      onChange={(e) => setVideoEnabled(e.target.checked)}
                    />
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-fg">
                      <HugeiconsIcon
                        icon={IconVideo}
                        size={14}
                        strokeWidth={1.8}
                        aria-hidden={true}
                      />
                      Record video of a window
                    </span>
                  </label>
                  {videoEnabled && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <select
                          className={`${SELECT} min-w-0 flex-1`}
                          value={videoWindowId ?? ''}
                          onChange={(e) => setVideoWindowId(e.target.value || null)}
                          aria-label="Window to record"
                        >
                          <option value="">Select a window…</option>
                          {windows.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.app ? `${w.app} — ${w.title}` : w.title}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm border border-glass-border bg-[rgba(255,255,255,0.05)] p-[9px] text-fg-dim shadow-liquid hover:bg-hover hover:text-fg"
                          onClick={refreshWindows}
                          title="Refresh window list"
                          aria-label="Refresh window list"
                        >
                          <HugeiconsIcon
                            icon={IconRegenerate}
                            size={14}
                            strokeWidth={1.8}
                            aria-hidden={true}
                          />
                        </button>
                      </div>
                      {videoWindowId == null ? (
                        <span className="inline-flex items-start gap-1 text-[11px] leading-snug text-[#ffb454]">
                          <HugeiconsIcon
                            icon={IconAlert}
                            size={12}
                            strokeWidth={1.8}
                            className="mt-px shrink-0"
                            aria-hidden={true}
                          />
                          <span>Pick the window (e.g. your meeting) to save it as video.</span>
                        </span>
                      ) : !systemOnly ? (
                        <span className="inline-flex items-start gap-1 text-[11px] leading-snug text-fg-faint">
                          <HugeiconsIcon
                            icon={IconMic}
                            size={12}
                            strokeWidth={1.8}
                            className="mt-px shrink-0"
                            aria-hidden={true}
                          />
                          <span>
                            Saved as MP4 with your mic + system audio. Use headphones — on speakers
                            the mic re-records the system sound (doubling). To capture a video/music
                            without your voice, switch to System only.
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-start gap-1 text-[11px] leading-snug text-fg-faint">
                          <HugeiconsIcon
                            icon={IconWindow}
                            size={12}
                            strokeWidth={1.8}
                            className="mt-px shrink-0"
                            aria-hidden={true}
                          />
                          <span>
                            Saved with this session as an MP4 (video + the window&apos;s system
                            audio).
                          </span>
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}

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
              onClick={() => void start(title)}
              disabled={state === 'starting'}
            >
              <HugeiconsIcon icon={IconRecord} size={17} strokeWidth={1.8} aria-hidden={true} />
              {state === 'starting' ? 'Starting…' : 'Start Transcription'}
            </button>
            <p className="mx-auto mt-3.5 max-w-[360px] text-[13px] leading-[1.5] text-fg-faint">
              When you start, this window turns into the live transcription view with <b>Pause</b> &{' '}
              <b>Finish</b> buttons on top.
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
