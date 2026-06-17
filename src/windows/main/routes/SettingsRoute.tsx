import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { getVersion } from '@tauri-apps/api/app';
import {
  getAiModel,
  getAiProvider,
  getLlamaConfig,
  getSummaryLanguage,
  hasApiKey,
  listDevices,
  setAiModel,
  setAiProvider,
  setApiKey,
  setDevices,
  setLlamaConfig,
  setSummaryLanguage,
} from '../../../lib/ipc';
import { SUMMARY_LANGUAGES } from '../../../lib/languages';
import { AI_PROVIDERS, MODEL_SUGGESTIONS, PROVIDER_OPTIONS } from '../../../lib/aiProviders';
import { isMacOS, isLinux } from '../../../lib/platform';
import {
  IconAlert,
  IconCheck,
  IconDevices,
  IconDownload,
  IconExternal,
  IconGift,
  IconKey,
  IconLanguage,
  IconMic,
  IconSpeaker,
} from '../../../lib/icons';
import { useConfigStore } from '../../../state/configStore';
import { useUpdateStore } from '../../../state/updateStore';
import { checkForUpdate, downloadAndInstall, restartApp } from '../../../lib/updater';
import type { AiProvider, DeviceLists } from '../../../types/domain';
import { AppearanceSection } from './settings/AppearanceSection';
import { BehaviorSection } from './settings/BehaviorSection';
import { deriveUpdateStatus } from './settings/updateStatus';
import {
  BADGE_OPT,
  BADGE_REQ,
  BTN,
  BTN_PRIMARY,
  FIELD,
  FIELD_CTRL,
  FIELD_LABEL,
  H3,
  SUBHEAD,
} from './settings/styles';

// Open external links in the system browser (Tauri), with a plain-web fallback
// so the links still work under `vite dev` outside the Tauri webview.
async function openExternal(url: string) {
  try {
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export default function SettingsRoute() {
  const [devices, setDeviceLists] = useState<DeviceLists | null>(null);
  const [dgKey, setDgKey] = useState('');
  const [dgSaved, setDgSaved] = useState(false);
  // Per-provider AI-key input values + "saved" flags, keyed by provider id.
  const [aiKeys, setAiKeys] = useState<Record<AiProvider, string>>(
    () => Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, ''])) as Record<AiProvider, string>,
  );
  const [aiSaved, setAiSaved] = useState<Record<AiProvider, boolean>>(
    () => Object.fromEntries(AI_PROVIDERS.map((p) => [p.id, false])) as Record<AiProvider, boolean>,
  );
  const [status, setStatus] = useState('');
  // AI-summary output language ("auto" or a language code), persisted in the DB.
  const [summaryLang, setSummaryLang] = useState('auto');
  // Active AI provider for summaries + live translation + chat, persisted in the DB.
  const [aiProvider, setAiProviderState] = useState<AiProvider>('openai');
  // Chosen model for the active provider (shared across all providers, incl. llama).
  const [model, setModel] = useState('');
  // Local-Llama base URL (only relevant when the active provider is "llama"; the
  // model uses the shared `model` state above like every other provider).
  const [llamaBaseUrl, setLlamaBaseUrl] = useState('');

  // Device selection is shared with the Start-transcription screen via the config store.
  const inputDevice = useConfigStore((s) => s.inputDevice);
  const outputDevice = useConfigStore((s) => s.outputDevice);
  const setInputDevice = useConfigStore((s) => s.setInputDevice);
  const setOutputDevice = useConfigStore((s) => s.setOutputDevice);
  const autoSummarizeOnFinish = useConfigStore((s) => s.autoSummarizeOnFinish);
  const setAutoSummarizeOnFinish = useConfigStore((s) => s.setAutoSummarizeOnFinish);

  // App update (in-app updater): current version + the check/download/restart flow.
  const [appVersion, setAppVersion] = useState('');
  const updateStatus = useUpdateStore((s) => s.status);
  const updateVersion = useUpdateStore((s) => s.version);
  const updateDownloaded = useUpdateStore((s) => s.downloaded);
  const updateContentLength = useUpdateStore((s) => s.contentLength);
  const updateError = useUpdateStore((s) => s.error);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    listDevices()
      .then((d) => {
        setDeviceLists(d);
        // Seed defaults only if nothing is selected yet, so a choice made on
        // the Start-transcription screen isn't clobbered.
        const cfg = useConfigStore.getState();
        if (cfg.inputDevice == null) {
          setInputDevice(d.input.find((x) => x.isDefault)?.id ?? d.input[0]?.id ?? null);
        }
        if (cfg.outputDevice == null) {
          setOutputDevice(d.output.find((x) => x.isDefault)?.id ?? d.output[0]?.id ?? null);
        }
      })
      .catch((e) => setStatus(`Failed to load devices: ${e}`));
    hasApiKey('deepgram')
      .then(setDgSaved)
      .catch(() => {});
    AI_PROVIDERS.forEach((p) => {
      hasApiKey(p.id)
        .then((has) => setAiSaved((s) => ({ ...s, [p.id]: has })))
        .catch(() => {});
    });
    getSummaryLanguage()
      .then(setSummaryLang)
      .catch(() => {});
    getAiProvider()
      .then(setAiProviderState)
      .catch(() => {});
    getLlamaConfig()
      .then((c) => setLlamaBaseUrl(c.baseUrl))
      .catch(() => {});
  }, [setInputDevice, setOutputDevice]);

  // Load the active provider's chosen model whenever it changes (works for every
  // provider, including llama — both read the unified `ai_model:<id>` setting).
  useEffect(() => {
    getAiModel(aiProvider)
      .then(setModel)
      .catch(() => {});
  }, [aiProvider]);

  async function saveSummaryLanguage(code: string) {
    setSummaryLang(code);
    try {
      await setSummaryLanguage(code);
      setStatus('Summary language saved.');
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  }

  async function saveDevices() {
    try {
      await setDevices(inputDevice, outputDevice);
      setStatus('Devices saved.');
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  }

  async function saveAiProvider(provider: AiProvider) {
    setAiProviderState(provider);
    try {
      await setAiProvider(provider);
      setStatus('AI provider saved.');
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  }

  async function saveDeepgramKey() {
    const value = dgKey.trim();
    if (!value) return;
    try {
      await setApiKey('deepgram', value);
      setDgKey('');
      setDgSaved(true);
      setStatus('deepgram API key saved.');
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  }

  async function saveAiKey(id: AiProvider) {
    const value = (aiKeys[id] ?? '').trim();
    if (!value) return;
    try {
      await setApiKey(id, value);
      setAiKeys((k) => ({ ...k, [id]: '' }));
      setAiSaved((s) => ({ ...s, [id]: true }));
      setStatus(`${id} API key saved.`);
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  }

  async function saveLlamaConfig() {
    try {
      await setLlamaConfig(llamaBaseUrl, model);
      setStatus('Local Llama settings saved.');
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  }

  async function saveModel() {
    try {
      await setAiModel(aiProvider, model);
      setStatus('Model saved.');
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  }

  // The active provider's key metadata — undefined for local Llama (no cloud key).
  const activeProvider = AI_PROVIDERS.find((p) => p.id === aiProvider);
  const activeLabel = PROVIDER_OPTIONS.find((p) => p.id === aiProvider)?.label ?? 'this provider';

  // Derive the App-update status line from the updater store.
  const { msg: updateMsg, warn: updateMsgWarn } = deriveUpdateStatus(
    updateStatus,
    updateVersion,
    updateDownloaded,
    updateContentLength,
    updateError,
  );

  return (
    <div className="mx-auto max-w-[620px] px-8 py-7">
      <h2 className="mb-5 text-[20px] font-semibold">Settings</h2>

      <section className="mb-7">
        <h3 className={H3}>
          <HugeiconsIcon icon={IconKey} size={13} strokeWidth={1.8} aria-hidden={true} />
          API Keys
        </h3>
        {/* Many users confuse Deepgram with the AI keys and fill in only one,
            thinking they're alternatives. Make explicit that Deepgram is the
            required transcription engine and the AI keys are a separate optional add-on. */}
        <div className="mb-4 flex flex-col gap-1.5 rounded-sm border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-3 py-2.5 text-[12px] leading-[1.55] text-fg-dim">
          <span>
            <b className="text-fg">Deepgram</b> and the <b className="text-fg">AI keys</b> (OpenAI,
            Gemini, Claude, …) are{' '}
            <b className="text-fg">two different services, not alternatives</b> — you don&apos;t
            choose one or the other.
          </span>
          <span>
            <b className="text-accent">Deepgram is required</b> — it powers live transcription, the
            app&apos;s core feature. The AI keys are <b className="text-fg">optional</b> and only
            add AI summaries &amp; live translation on top.
          </span>
        </div>
        {/* Group 1 — the required speech-to-text key */}
        <div className="mb-2 flex items-center gap-2">
          <span className={SUBHEAD}>Speech-to-text engine</span>
          <span className={BADGE_REQ}>Required</span>
        </div>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>
            Deepgram API Key{' '}
            {dgSaved && (
              <em className="ml-1.5 inline-flex items-center gap-1 text-[11.5px] text-ok not-italic">
                <HugeiconsIcon icon={IconCheck} size={13} strokeWidth={2} aria-hidden={true} />
                saved
              </em>
            )}
          </span>
          <div className="flex gap-2">
            <input
              className={FIELD_CTRL}
              type="password"
              value={dgKey}
              onChange={(e) => setDgKey(e.target.value)}
              placeholder={dgSaved ? '••••••••••••' : 'Deepgram token…'}
            />
            <button className={BTN} onClick={() => void saveDeepgramKey()}>
              Save
            </button>
          </div>
        </label>
        {/* How to get a Deepgram key + the free-credit nudge */}
        <div className="-mt-1 mb-3.5 flex flex-col gap-1.5 rounded-sm border border-[rgba(110,168,254,0.28)] bg-[rgba(110,168,254,0.08)] px-3 py-2.5">
          <span className="inline-flex items-start gap-1.5 text-[12px] leading-[1.5] text-fg-dim">
            <HugeiconsIcon
              icon={IconGift}
              size={14}
              strokeWidth={1.8}
              className="mt-px shrink-0 text-accent"
              aria-hidden={true}
            />
            <span>
              New Deepgram accounts get <b className="text-fg">$200 in free credit</b> (~45,000
              minutes) — no credit card required.
            </span>
          </span>
          <button
            type="button"
            className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-[12.5px] text-accent hover:underline"
            onClick={() => void openExternal('https://console.deepgram.com/signup')}
          >
            Get a free Deepgram API key
            <HugeiconsIcon icon={IconExternal} size={13} strokeWidth={1.8} aria-hidden={true} />
          </button>
          <span className="text-[11px] leading-[1.5] text-fg-faint">
            Sign up, create an API key in the Deepgram console, then paste it above.
          </span>
        </div>
        {/* Group 2 — the optional AI keys (summaries + live translation) */}
        <div className="mt-5 mb-2 flex items-center gap-2">
          <span className={SUBHEAD}>AI summaries &amp; translation</span>
          <span className={BADGE_OPT}>Optional</span>
        </div>
        <p className="mb-3 text-[11.5px] leading-[1.5] text-fg-faint">
          Separate from Deepgram — skip entirely if you only need transcription. Pick a provider,
          then configure just that one: its API key (cloud) or a local server (Llama).
        </p>
        {/* Pick the provider first — only its own fields show below. */}
        <label className={FIELD}>
          <span className={FIELD_LABEL}>AI provider</span>
          <select
            className={FIELD_CTRL}
            value={aiProvider}
            onChange={(e) => void saveAiProvider(e.target.value as AiProvider)}
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {/* The selected provider's config — and nothing else. */}
        <div className="mb-3.5 flex flex-col gap-2.5 rounded-sm border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] px-3 py-3">
          {activeProvider ? (
            <>
              <label className={FIELD}>
                <span className={FIELD_LABEL}>
                  {activeProvider.label} API key{' '}
                  {aiSaved[activeProvider.id] && (
                    <em className="ml-1.5 inline-flex items-center gap-1 text-[11.5px] text-ok not-italic">
                      <HugeiconsIcon
                        icon={IconCheck}
                        size={13}
                        strokeWidth={2}
                        aria-hidden={true}
                      />
                      saved
                    </em>
                  )}
                </span>
                <div className="flex gap-2">
                  <input
                    className={FIELD_CTRL}
                    type="password"
                    value={aiKeys[activeProvider.id] ?? ''}
                    onChange={(e) =>
                      setAiKeys((k) => ({ ...k, [activeProvider.id]: e.target.value }))
                    }
                    placeholder={
                      aiSaved[activeProvider.id] ? '••••••••••••' : activeProvider.placeholder
                    }
                  />
                  <button className={BTN} onClick={() => void saveAiKey(activeProvider.id)}>
                    Save
                  </button>
                </div>
              </label>
              <button
                type="button"
                className="-mt-1 inline-flex w-fit cursor-pointer items-center gap-1.5 text-[12px] text-fg-dim hover:text-accent hover:underline"
                onClick={() => void openExternal(activeProvider.keysUrl)}
              >
                Get a {activeProvider.label} API key
                <HugeiconsIcon icon={IconExternal} size={12} strokeWidth={1.8} aria-hidden={true} />
              </button>
            </>
          ) : (
            <>
              <span className="text-[12px] leading-[1.5] text-fg-dim">
                Runs against a <b className="text-fg">local, OpenAI-compatible</b> server — no cloud
                key needed. Works with <b className="text-fg-dim">Ollama</b> (default),{' '}
                <b className="text-fg-dim">LM Studio</b>, or{' '}
                <b className="text-fg-dim">llama.cpp</b>.
              </span>
              <label className={FIELD}>
                <span className={FIELD_LABEL}>Local server base URL</span>
                <input
                  className={FIELD_CTRL}
                  type="text"
                  value={llamaBaseUrl}
                  onChange={(e) => setLlamaBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  spellCheck={false}
                  autoCapitalize="off"
                />
              </label>
            </>
          )}
          {/* Model — every provider has one. */}
          <label className={FIELD}>
            <span className={FIELD_LABEL}>Model</span>
            <div className="flex gap-2">
              <input
                className={FIELD_CTRL}
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                list={`models-${aiProvider}`}
                placeholder={MODEL_SUGGESTIONS[aiProvider]?.[0] ?? ''}
                spellCheck={false}
                autoCapitalize="off"
              />
              <button
                className={BTN}
                onClick={() => void (aiProvider === 'llama' ? saveLlamaConfig() : saveModel())}
              >
                Save
              </button>
            </div>
            <datalist id={`models-${aiProvider}`}>
              {(MODEL_SUGGESTIONS[aiProvider] ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <span className="text-[11.5px] leading-[1.4] text-fg-faint">
              Which model {activeLabel} uses — pick a suggestion or type any it supports.
              {aiProvider === 'llama' &&
                " Make sure it's one you've pulled (e.g. ollama pull llama3.1)."}
            </span>
          </label>
        </div>
        <label className="mb-3.5 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#6ea8fe]"
            checked={autoSummarizeOnFinish}
            onChange={(e) => setAutoSummarizeOnFinish(e.target.checked)}
          />
          <span className="flex flex-col gap-0.5">
            <span className={FIELD_LABEL}>Auto-summarize when a recording finishes</span>
            <span className="text-[11.5px] leading-[1.4] text-fg-faint">
              Generates the AI summary automatically as soon as a recording ends, using the active
              provider above. Needs that provider set up — otherwise it&apos;s skipped.
            </span>
          </span>
        </label>
        <p className="mt-2 text-[12px] leading-[1.5] text-fg-faint">
          Keys are stored securely in{' '}
          {isMacOS
            ? 'the macOS Keychain'
            : isLinux
              ? 'the system keyring (GNOME Keyring / KWallet)'
              : 'Windows Credential Manager'}{' '}
          and are never sent to the frontend.
        </p>
      </section>

      <section className="mb-7">
        <h3 className={H3}>
          <HugeiconsIcon icon={IconDevices} size={13} strokeWidth={1.8} aria-hidden={true} />
          Audio Devices
        </h3>
        <label className={FIELD}>
          <span className={`${FIELD_LABEL} inline-flex items-center gap-1.5`}>
            <HugeiconsIcon icon={IconMic} size={13} strokeWidth={1.8} aria-hidden={true} />
            Microphone
          </span>
          <select
            className={FIELD_CTRL}
            value={inputDevice ?? ''}
            onChange={(e) => setInputDevice(e.target.value || null)}
          >
            {devices?.input.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD}>
          <span className={`${FIELD_LABEL} inline-flex items-center gap-1.5`}>
            <HugeiconsIcon icon={IconSpeaker} size={13} strokeWidth={1.8} aria-hidden={true} />
            {isMacOS || isLinux
              ? 'System audio source'
              : 'System audio source (the output to loop back)'}
          </span>
          <select
            className={FIELD_CTRL}
            value={outputDevice ?? ''}
            onChange={(e) => setOutputDevice(e.target.value || null)}
          >
            {devices?.output.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.isDefault ? ' (default)' : ''}
              </option>
            ))}
          </select>
          {isMacOS && (
            <span className="text-[11.5px] leading-[1.4] text-fg-faint">
              macOS can&apos;t capture speakers directly. Install a virtual audio device like{' '}
              <b className="text-fg-dim">BlackHole</b>, route your output into it via a Multi-Output
              Device, then select it here.
            </span>
          )}
          {isLinux && (
            <span className="text-[11.5px] leading-[1.4] text-fg-faint">
              System audio is captured automatically from your default output&apos;s{' '}
              <b className="text-fg-dim">monitor</b> (PulseAudio/PipeWire) — no setup needed. Pick a
              specific output here to capture that one instead.
            </span>
          )}
        </label>
        <button
          className="mt-1 cursor-pointer rounded-sm border border-[rgba(255,255,255,0.3)] bg-[rgba(110,168,254,0.24)] px-4 py-[9px] text-[13px] whitespace-nowrap text-[#dbe8ff] shadow-liquid hover:bg-[rgba(110,168,254,0.34)]"
          onClick={() => void saveDevices()}
        >
          Save devices
        </button>
      </section>

      <AppearanceSection />

      <BehaviorSection />

      <section className="mb-7">
        <h3 className={H3}>
          <HugeiconsIcon icon={IconLanguage} size={13} strokeWidth={1.8} aria-hidden={true} />
          Language
        </h3>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>AI summary language</span>
          <select
            className={FIELD_CTRL}
            value={summaryLang}
            onChange={(e) => void saveSummaryLanguage(e.target.value)}
          >
            {SUMMARY_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <span className="text-[11.5px] leading-[1.4] text-fg-faint">
            Language used for AI session summaries. "Auto" matches the transcript language. Saved to
            the database.
          </span>
        </label>
        <p className="mt-2 text-[12px] leading-[1.5] text-fg-faint">
          All languages now use Deepgram's <b>Nova-3</b> model (best accuracy, including
          Indonesian). Pick the language on the main screen before you start recording. The{' '}
          <i>Auto-detect (multilingual)</i> option recognizes a mix of languages automatically, but
          choosing one specific language is usually more accurate.
        </p>
      </section>

      <section className="mb-7">
        <h3 className={H3}>
          <HugeiconsIcon icon={IconDownload} size={13} strokeWidth={1.8} aria-hidden={true} />
          App update
        </h3>
        <p className="mb-3 text-[12px] leading-[1.5] text-fg-faint">
          Updates install in-app from GitHub Releases — no need to download installers manually.
          {appVersion && (
            <>
              {' '}
              You&apos;re on <b className="text-fg-dim">version {appVersion}</b>.
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${BTN} disabled:cursor-default disabled:opacity-60`}
            disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
            onClick={() => void checkForUpdate()}
          >
            {updateStatus === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
          {updateStatus === 'available' && (
            <button type="button" className={BTN_PRIMARY} onClick={() => void downloadAndInstall()}>
              Download &amp; install{updateVersion ? ` ${updateVersion}` : ''}
            </button>
          )}
          {updateStatus === 'ready' && (
            <button type="button" className={BTN_PRIMARY} onClick={() => void restartApp()}>
              Restart to update
            </button>
          )}
        </div>
        {updateMsg && (
          <p
            className={`mt-2.5 text-[12.5px] leading-[1.4] ${
              updateMsgWarn ? 'text-[#ffb454]' : 'text-fg-dim'
            }`}
          >
            {updateMsg}
          </p>
        )}
      </section>

      {status && (
        <p
          className={`mt-2 inline-flex items-center gap-1.5 text-[12.5px] ${
            /^(Error|Failed)/.test(status) ? 'text-[#ffb454]' : 'text-ok'
          }`}
        >
          <HugeiconsIcon
            icon={/^(Error|Failed)/.test(status) ? IconAlert : IconCheck}
            size={14}
            strokeWidth={1.8}
            aria-hidden={true}
          />
          {status}
        </p>
      )}
    </div>
  );
}
