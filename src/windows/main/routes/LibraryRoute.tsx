import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSession } from "../../../hooks/useSession";
import { useSessionStore } from "../../../state/sessionStore";
import { useConfigStore, type LanguageCode } from "../../../state/configStore";
import { hasApiKey, setTranscriptionOptions } from "../../../lib/ipc";
import { LANGUAGES } from "../../../lib/languages";

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
      <div className="home">
        <div className="home-icon">🎙️</div>
        <h2>Mulai transkripsi</h2>

        {keyReady === false ? (
          <>
            <p className="muted">
              Deepgram API key belum diatur. Atur dulu untuk mulai transkripsi.
            </p>
            <Link to="/main/settings" className="big-btn">
              ⚙ Buka Settings
            </Link>
          </>
        ) : (
          <>
            <div className="quick-config">
              <label>
                <span>Bahasa</span>
                <select value={language} onChange={onLanguage}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Sumber audio</span>
                <select
                  value={systemOnly ? "system" : "both"}
                  onChange={onSource}
                >
                  <option value="both">System + Mikrofon (meeting)</option>
                  <option value="system">System saja (video/musik)</option>
                </select>
              </label>
            </div>

            <button
              className="big-btn start"
              onClick={() => void start()}
              disabled={state === "starting"}
            >
              ● {state === "starting" ? "Memulai…" : "Mulai Transkripsi"}
            </button>
            <p className="muted">
              Saat mulai, jendela ini berubah jadi tampilan transkripsi langsung
              dengan tombol <b>Jeda</b> & <b>Selesai</b> di atas. Bahasa spesifik
              (Indonesia/English) biasanya lebih akurat daripada Auto.
            </p>
          </>
        )}

        {state === "error" && error && <p className="home-err">{error}</p>}
      </div>
    </div>
  );
}
