import { useEffect, useState } from "react";
import {
  hasApiKey,
  listDevices,
  setApiKey,
  setDevices,
} from "../../../lib/ipc";
import type { DeviceLists } from "../../../types/domain";

const FIELD_CTRL =
  "w-full flex-1 rounded-sm border border-glass-border bg-[rgba(255,255,255,0.05)] px-[11px] py-[9px] text-[13px] text-fg outline-none focus:border-accent";
const BTN =
  "cursor-pointer rounded-sm border border-glass-border bg-[rgba(255,255,255,0.06)] px-4 py-[9px] text-[13px] text-fg whitespace-nowrap hover:bg-hover";
const H3 = "mb-3 text-[12px] uppercase tracking-[0.06em] text-fg-faint";
const FIELD = "mb-3.5 flex flex-col gap-1.5";
const FIELD_LABEL = "text-[13px] text-fg-dim";

export default function SettingsRoute() {
  const [devices, setDeviceLists] = useState<DeviceLists | null>(null);
  const [inputId, setInputId] = useState("");
  const [outputId, setOutputId] = useState("");
  const [dgKey, setDgKey] = useState("");
  const [oaKey, setOaKey] = useState("");
  const [dgSaved, setDgSaved] = useState(false);
  const [oaSaved, setOaSaved] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    listDevices()
      .then((d) => {
        setDeviceLists(d);
        setInputId(d.input.find((x) => x.isDefault)?.id ?? d.input[0]?.id ?? "");
        setOutputId(
          d.output.find((x) => x.isDefault)?.id ?? d.output[0]?.id ?? "",
        );
      })
      .catch((e) => setStatus(`Gagal memuat device: ${e}`));
    hasApiKey("deepgram").then(setDgSaved).catch(() => {});
    hasApiKey("openai").then(setOaSaved).catch(() => {});
  }, []);

  async function saveDevices() {
    try {
      await setDevices(inputId || null, outputId || null);
      setStatus("Device tersimpan.");
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  }

  async function saveKey(service: "deepgram" | "openai") {
    const value = (service === "deepgram" ? dgKey : oaKey).trim();
    if (!value) return;
    try {
      await setApiKey(service, value);
      if (service === "deepgram") {
        setDgKey("");
        setDgSaved(true);
      } else {
        setOaKey("");
        setOaSaved(true);
      }
      setStatus(`${service} API key tersimpan.`);
    } catch (e) {
      setStatus(`Error: ${e}`);
    }
  }

  return (
    <div className="mx-auto max-w-[620px] px-8 py-7">
      <h2 className="mb-5 text-[20px] font-semibold">Settings</h2>

      <section className="mb-7">
        <h3 className={H3}>API Keys</h3>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>
            Deepgram API Key{" "}
            {dgSaved && (
              <em className="ml-1.5 text-[11.5px] not-italic text-ok">
                ✓ tersimpan
              </em>
            )}
          </span>
          <div className="flex gap-2">
            <input
              className={FIELD_CTRL}
              type="password"
              value={dgKey}
              onChange={(e) => setDgKey(e.target.value)}
              placeholder={dgSaved ? "••••••••••••" : "Token Deepgram…"}
            />
            <button className={BTN} onClick={() => void saveKey("deepgram")}>
              Simpan
            </button>
          </div>
        </label>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>
            OpenAI API Key{" "}
            {oaSaved && (
              <em className="ml-1.5 text-[11.5px] not-italic text-ok">
                ✓ tersimpan
              </em>
            )}
          </span>
          <div className="flex gap-2">
            <input
              className={FIELD_CTRL}
              type="password"
              value={oaKey}
              onChange={(e) => setOaKey(e.target.value)}
              placeholder={oaSaved ? "••••••••••••" : "sk-…"}
            />
            <button className={BTN} onClick={() => void saveKey("openai")}>
              Simpan
            </button>
          </div>
        </label>
        <p className="mt-2 text-[12px] leading-[1.5] text-fg-faint">
          Key disimpan aman di Windows Credential Manager dan tidak pernah
          dikirim ke frontend.
        </p>
      </section>

      <section className="mb-7">
        <h3 className={H3}>Audio Devices</h3>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>Mikrofon</span>
          <select
            className={FIELD_CTRL}
            value={inputId}
            onChange={(e) => setInputId(e.target.value)}
          >
            {devices?.input.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={FIELD}>
          <span className={FIELD_LABEL}>
            Sumber system audio (output yang di-loopback)
          </span>
          <select
            className={FIELD_CTRL}
            value={outputId}
            onChange={(e) => setOutputId(e.target.value)}
          >
            {devices?.output.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className="mt-1 cursor-pointer rounded-sm border border-[rgba(110,168,254,0.4)] bg-[rgba(110,168,254,0.18)] px-4 py-[9px] text-[13px] text-[#dbe8ff] whitespace-nowrap hover:bg-hover"
          onClick={() => void saveDevices()}
        >
          Simpan device
        </button>
      </section>

      <section className="mb-7">
        <h3 className={H3}>Bahasa</h3>
        <p className="mt-2 text-[12px] leading-[1.5] text-fg-faint">
          Semua bahasa kini memakai model <b>Nova-3</b> Deepgram (akurasi terbaik,
          termasuk Bahasa Indonesia). Pilih bahasa di layar utama sebelum mulai
          merekam. Opsi <i>Auto-deteksi (multilingual)</i> mengenali campuran
          beberapa bahasa otomatis, tetapi memilih satu bahasa spesifik biasanya
          lebih akurat.
        </p>
      </section>

      {status && <p className="mt-2 text-[12.5px] text-ok">{status}</p>}
    </div>
  );
}
