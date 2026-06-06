import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteSession,
  getSession,
  renameSession,
  summarizeSession,
} from "../../../lib/ipc";
import { formatDateTime } from "../../../lib/format";
import { languageLabel } from "../../../lib/languages";
import type { SessionDetail } from "../../../types/domain";

export default function SessionDetailRoute() {
  const { id } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEditing(false);
    setConfirmDelete(false);
    setSummarizing(false);
    setErr("");
    getSession(sessionId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sessionId]);

  async function saveTitle() {
    const next = titleDraft.trim();
    setEditing(false);
    if (!detail || !next || next === detail.session.title) return;
    try {
      await renameSession(sessionId, next);
      setDetail({ ...detail, session: { ...detail.session, title: next } });
    } catch (e) {
      setErr(String(e));
    }
  }

  async function doDelete() {
    try {
      await deleteSession(sessionId);
      navigate("/main");
    } catch (e) {
      setErr(String(e));
    }
  }

  async function doSummarize() {
    setErr("");
    setSummarizing(true);
    try {
      await summarizeSession(sessionId);
      // Refetch so summary, model, and timestamp come straight from the DB.
      const fresh = await getSession(sessionId);
      if (fresh) setDetail(fresh);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSummarizing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="muted">Memuat…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="empty-state">
          <h2>Sesi tidak ditemukan</h2>
          <p>
            Rekaman ini mungkin sudah dihapus.{" "}
            <Link to="/main">Kembali ke beranda</Link>
          </p>
        </div>
      </div>
    );
  }

  const { session, segments } = detail;

  return (
    <div className="detail">
      <div className="detail-head">
        <div className="detail-title-row">
          {editing ? (
            <input
              className="detail-title-input"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveTitle();
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={() => void saveTitle()}
            />
          ) : (
            <h2 className="detail-title">{session.title}</h2>
          )}
          <div className="detail-actions">
            {!editing && (
              <button
                onClick={() => {
                  setTitleDraft(session.title);
                  setEditing(true);
                }}
              >
                ✎ Ganti nama
              </button>
            )}
            {confirmDelete ? (
              <>
                <button className="danger" onClick={() => void doDelete()}>
                  Hapus permanen
                </button>
                <button onClick={() => setConfirmDelete(false)}>Batal</button>
              </>
            ) : (
              <button
                className="danger-ghost"
                onClick={() => setConfirmDelete(true)}
              >
                🗑 Hapus
              </button>
            )}
          </div>
        </div>
        <p className="detail-meta">
          {formatDateTime(session.startedAt)} · {languageLabel(session.language)}{" "}
          · {session.segmentCount} baris ·{" "}
          {session.systemOnly ? "System saja" : "System + Mikrofon"}
        </p>
      </div>

      {segments.length > 0 && (
        <section className="summary-section">
          <div className="summary-head">
            <h3>Ringkasan AI</h3>
            {session.summary && (
              <button
                className="sum-btn ghost"
                onClick={() => void doSummarize()}
                disabled={summarizing}
              >
                {summarizing ? "Memproses…" : "↻ Buat ulang"}
              </button>
            )}
          </div>

          {session.summary ? (
            <>
              <SummaryView text={session.summary} />
              {session.summarizedAt && (
                <p className="summary-meta">
                  Dibuat {formatDateTime(session.summarizedAt)}
                  {session.summaryModel ? ` · ${session.summaryModel}` : ""}
                </p>
              )}
            </>
          ) : (
            <div className="summary-empty">
              <p className="muted">
                Selesaikan transkrip ini dengan membuat ringkasan otomatis —
                ringkasan singkat, poin penting, dan tindak lanjut — memakai
                OpenAI.
              </p>
              <button
                className="sum-btn primary"
                onClick={() => void doSummarize()}
                disabled={summarizing}
              >
                {summarizing
                  ? "Membuat ringkasan…"
                  : "✓ Selesaikan & Buat Ringkasan"}
              </button>
            </div>
          )}
        </section>
      )}

      {segments.length === 0 ? (
        <p className="muted">Tidak ada transkrip tersimpan untuk sesi ini.</p>
      ) : (
        <div className="transcript">
          {segments.map((s, i) => (
            <div key={i} className={`line ${s.source}`}>
              <span className="line-speaker">
                {s.speaker ?? (s.source === "you" ? "You" : "Speaker")}
              </span>
              <span className="line-text">{s.text}</span>
            </div>
          ))}
        </div>
      )}

      {err && <p className="home-err">{err}</p>}
    </div>
  );
}

/** Minimal Markdown renderer for the summary: headings, bullet lists, paragraphs. */
function SummaryView({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    nodes.push(
      <ul className="sum-list" key={key}>
        {items.map((b, i) => (
          <li key={i}>{stripInline(b)}</li>
        ))}
      </ul>,
    );
  };

  text.split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (!t) {
      flushBullets(`u${i}`);
    } else if (/^#{1,6}\s+/.test(t)) {
      flushBullets(`u${i}`);
      nodes.push(
        <h4 className="sum-h" key={i}>
          {stripInline(t.replace(/^#{1,6}\s+/, ""))}
        </h4>,
      );
    } else if (/^[-*]\s+/.test(t)) {
      bullets.push(t.replace(/^[-*]\s+/, ""));
    } else {
      flushBullets(`u${i}`);
      nodes.push(
        <p className="sum-p" key={i}>
          {stripInline(t)}
        </p>,
      );
    }
  });
  flushBullets("uend");

  return <div className="summary-body">{nodes}</div>;
}

/** Strip basic inline Markdown emphasis (**bold**, `code`) for plain rendering. */
function stripInline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`(.+?)`/g, "$1");
}
