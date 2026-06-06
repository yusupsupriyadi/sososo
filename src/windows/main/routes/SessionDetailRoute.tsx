import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  IconAi,
  IconAlert,
  IconBack,
  IconCalendar,
  IconCheck,
  IconDelete,
  IconLanguage,
  IconLines,
  IconMic,
  IconNoTranscript,
  IconRegenerate,
  IconRemote,
  IconRename,
  IconSpeaker,
} from '../../../lib/icons';
import { deleteSession, getSession, renameSession, summarizeSession } from '../../../lib/ipc';
import { formatDateTime } from '../../../lib/format';
import { speakerColor } from '../../../lib/speaker';
import { languageLabel } from '../../../lib/languages';
import { useLibraryStore } from '../../../state/libraryStore';
import { useConfigStore } from '../../../state/configStore';
import type { SessionDetail } from '../../../types/domain';

const ACTION_BTN =
  'inline-flex items-center gap-1.5 cursor-pointer rounded-sm border border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.08)] px-[11px] py-1.5 text-[12.5px] text-fg-dim whitespace-nowrap shadow-liquid hover:bg-hover hover:text-fg';

export default function SessionDetailRoute() {
  const { id } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const transcriptScale = useConfigStore((s) => s.transcriptScale);

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEditing(false);
    setConfirmDelete(false);
    setSummarizing(false);
    setErr('');
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
      refreshLibrary(); // sidebar shows the new title without a remount
    } catch (e) {
      setErr(String(e));
    }
  }

  async function doDelete() {
    try {
      await deleteSession(sessionId);
      refreshLibrary(); // drop the deleted session from the sidebar list
      navigate('/main');
    } catch (e) {
      setErr(String(e));
    }
  }

  async function doSummarize() {
    setErr('');
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
        <p className="text-[13px] text-fg-faint">Loading…</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-[420px] text-center text-fg-dim">
          <h2 className="mb-2 text-[18px] font-semibold text-fg">Session not found</h2>
          <p className="text-[13.5px] leading-[1.5]">
            This recording may have been deleted.{' '}
            <Link to="/main" className="inline-flex items-center gap-1 text-accent">
              <HugeiconsIcon icon={IconBack} size={13} strokeWidth={1.8} aria-hidden={true} />
              <span className="underline">Back to home</span>
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const { session, segments } = detail;

  return (
    <div className="mx-auto max-w-[760px] px-7 py-6">
      <div className="mb-5 border-b border-glass-border pb-3.5">
        <div className="flex items-center gap-3">
          {editing ? (
            <input
              className="flex-1 rounded-sm border border-accent bg-[rgba(255,255,255,0.06)] px-2.5 py-[7px] text-[18px] font-semibold text-fg outline-none"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveTitle();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={() => void saveTitle()}
            />
          ) : (
            <h2 className="m-0 flex-1 text-[19px] font-semibold break-words text-fg">
              {session.title}
            </h2>
          )}
          <div className="flex shrink-0 gap-1.5">
            {!editing && (
              <button
                className={ACTION_BTN}
                onClick={() => {
                  setTitleDraft(session.title);
                  setEditing(true);
                }}
              >
                <HugeiconsIcon icon={IconRename} size={14} strokeWidth={1.8} aria-hidden={true} />
                Rename
              </button>
            )}
            {confirmDelete ? (
              <>
                <button
                  className="cursor-pointer rounded-sm border border-[rgba(255,93,93,0.55)] bg-[rgba(255,93,93,0.24)] px-[11px] py-1.5 text-[12.5px] whitespace-nowrap text-[#ffd9d9] shadow-liquid hover:bg-hover hover:text-fg"
                  onClick={() => void doDelete()}
                >
                  Delete permanently
                </button>
                <button className={ACTION_BTN} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.08)] px-[11px] py-1.5 text-[12.5px] whitespace-nowrap text-fg-dim shadow-liquid hover:border-[rgba(255,93,93,0.4)] hover:bg-hover hover:text-[#ffb4b4]"
                onClick={() => setConfirmDelete(true)}
              >
                <HugeiconsIcon icon={IconDelete} size={14} strokeWidth={1.8} aria-hidden={true} />
                Delete
              </button>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-fg-faint">
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon icon={IconCalendar} size={13} strokeWidth={1.8} aria-hidden={true} />
            {formatDateTime(session.startedAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon icon={IconLanguage} size={13} strokeWidth={1.8} aria-hidden={true} />
            {languageLabel(session.language)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon icon={IconLines} size={13} strokeWidth={1.8} aria-hidden={true} />
            {session.segmentCount} lines
          </span>
          <span className="inline-flex items-center gap-1.5">
            <HugeiconsIcon
              icon={session.systemOnly ? IconSpeaker : IconMic}
              size={13}
              strokeWidth={1.8}
              aria-hidden={true}
            />
            {session.systemOnly ? 'System only' : 'System + Microphone'}
          </span>
        </div>
      </div>

      {segments.length > 0 && (
        <section className="mb-[22px] rounded-md border border-glass-border bg-[rgba(110,168,254,0.07)] px-[18px] py-4">
          <div className="mb-2.5 flex items-center justify-between gap-2.5">
            <h3 className="m-0 inline-flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-accent uppercase">
              <HugeiconsIcon icon={IconAi} size={14} strokeWidth={1.8} aria-hidden={true} />
              AI Summary
            </h3>
            {session.summary && (
              <button
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.08)] px-[11px] py-1.5 text-[12.5px] font-medium whitespace-nowrap text-fg-dim shadow-liquid enabled:hover:bg-hover disabled:cursor-default disabled:opacity-60"
                onClick={() => void doSummarize()}
                disabled={summarizing}
              >
                {summarizing ? (
                  'Processing…'
                ) : (
                  <>
                    <HugeiconsIcon
                      icon={IconRegenerate}
                      size={14}
                      strokeWidth={1.8}
                      aria-hidden={true}
                    />
                    Regenerate
                  </>
                )}
              </button>
            )}
          </div>

          {session.summary ? (
            <>
              <SummaryView text={session.summary} />
              {session.summarizedAt && (
                <p className="mt-2.5 text-[11px] text-fg-faint">
                  Created {formatDateTime(session.summarizedAt)}
                  {session.summaryModel ? ` · ${session.summaryModel}` : ''}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="m-0 text-[13px] leading-[1.5] text-fg-dim">
                Finish this transcript by generating an automatic summary — overview, key points,
                and action items — using OpenAI.
              </p>
              <button
                className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-[rgba(255,255,255,0.3)] bg-[rgba(110,168,254,0.24)] px-4 py-[9px] text-[13px] font-semibold whitespace-nowrap text-[#dbe8ff] shadow-liquid enabled:hover:bg-[rgba(110,168,254,0.34)] disabled:cursor-default disabled:opacity-60"
                onClick={() => void doSummarize()}
                disabled={summarizing}
              >
                {summarizing ? (
                  'Generating summary…'
                ) : (
                  <>
                    <HugeiconsIcon
                      icon={IconCheck}
                      size={16}
                      strokeWidth={1.8}
                      aria-hidden={true}
                    />
                    Finish &amp; Summarize
                  </>
                )}
              </button>
            </div>
          )}
        </section>
      )}

      {segments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-fg-faint">
          <HugeiconsIcon icon={IconNoTranscript} size={32} strokeWidth={1.5} aria-hidden={true} />
          <p className="text-[13px]">No transcript saved for this session.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {segments.map((s, i) => (
            <div key={i} className="flex flex-col gap-[3px]">
              <span
                className="inline-flex items-center gap-1 font-semibold tracking-[0.02em]"
                style={{
                  fontSize: `${11 * transcriptScale}px`,
                  color: speakerColor(s.source, s.speaker),
                }}
              >
                <HugeiconsIcon
                  icon={s.source === 'you' ? IconMic : IconRemote}
                  size={Math.round(12 * transcriptScale)}
                  strokeWidth={2}
                  aria-hidden={true}
                />
                {s.speaker ?? (s.source === 'you' ? 'You' : 'Speaker')}
              </span>
              <span
                className="leading-[1.55] text-fg"
                style={{ fontSize: `${14 * transcriptScale}px` }}
              >
                {s.text}
              </span>
              {s.translation && (
                <span
                  className="mt-0.5 border-l-2 border-[rgba(110,168,254,0.4)] pl-2 text-fg-dim"
                  style={{ fontSize: `${13 * transcriptScale}px` }}
                >
                  {s.translation}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {err && (
        <p className="mt-4 flex items-start gap-2 rounded-sm border border-[rgba(255,180,84,0.25)] bg-[rgba(255,180,84,0.1)] px-3 py-2 text-[12.5px] text-[#ffb454]">
          <HugeiconsIcon
            icon={IconAlert}
            size={15}
            strokeWidth={1.8}
            className="mt-px shrink-0"
            aria-hidden={true}
          />
          <span>{err}</span>
        </p>
      )}
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
      <ul className="m-0 flex flex-col gap-[3px] pl-5" key={key}>
        {items.map((b, i) => (
          <li key={i} className="text-[13.5px] leading-[1.5] text-fg">
            {stripInline(b)}
          </li>
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
        <h4 className="mt-2 mb-0.5 text-[13.5px] font-semibold text-fg first:mt-0" key={i}>
          {stripInline(t.replace(/^#{1,6}\s+/, ''))}
        </h4>,
      );
    } else if (/^[-*]\s+/.test(t)) {
      bullets.push(t.replace(/^[-*]\s+/, ''));
    } else {
      flushBullets(`u${i}`);
      nodes.push(
        <p className="m-0 text-[13.5px] leading-[1.55] text-fg" key={i}>
          {stripInline(t)}
        </p>,
      );
    }
  });
  flushBullets('uend');

  return <div className="flex flex-col gap-1.5">{nodes}</div>;
}

/** Strip basic inline Markdown emphasis (**bold**, `code`) for plain rendering. */
function stripInline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1');
}
