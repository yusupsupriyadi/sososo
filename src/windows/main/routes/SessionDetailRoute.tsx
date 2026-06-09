import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { convertFileSrc } from '@tauri-apps/api/core';
import { HugeiconsIcon } from '@hugeicons/react';
import clsx from 'clsx';
import {
  IconAi,
  IconAlert,
  IconBack,
  IconCalendar,
  IconCheck,
  IconClose,
  IconDelete,
  IconLanguage,
  IconLines,
  IconMic,
  IconNoTranscript,
  IconRegenerate,
  IconRemote,
  IconRename,
  IconSearch,
  IconSpeaker,
} from '../../../lib/icons';
import {
  deleteSession,
  getAiProvider,
  getSession,
  getSummaryLanguage,
  hasApiKey,
  renameSession,
  renameSpeaker,
  setSummaryLanguage,
  summarizeSession,
  translateSegment,
} from '../../../lib/ipc';
import { formatDateTime } from '../../../lib/format';
import { speakerColor } from '../../../lib/speaker';
import { languageLabel, SUMMARY_LANGUAGES, TRANSLATE_TARGETS } from '../../../lib/languages';
import { useLibraryStore } from '../../../state/libraryStore';
import { useConfigStore } from '../../../state/configStore';
import { SummaryView } from './sessionDetail/markdown';
import { highlightText } from './sessionDetail/highlightText';
import { distinctSpeakers, type SpeakerEntry } from './sessionDetail/speakers';
import type { SessionDetail } from '../../../types/domain';

const ACTION_BTN =
  'inline-flex items-center gap-1.5 cursor-pointer rounded-sm border border-[rgba(255,255,255,0.25)] bg-[rgba(255,255,255,0.08)] px-[11px] py-1.5 text-[12.5px] text-fg-dim whitespace-nowrap shadow-liquid hover:bg-hover hover:text-fg';

/** Compact dropdown styling for the in-panel language selectors (summary + translate). */
const SELECT_CLS =
  'max-w-[170px] cursor-pointer truncate rounded-sm border border-glass-border bg-[rgba(255,255,255,0.06)] px-2 py-[5px] text-[12px] text-fg outline-none focus:border-accent disabled:cursor-default disabled:opacity-60';

/** How many saved lines to translate at once when batch-translating a transcript. */
const TRANSLATE_CONCURRENCY = 4;

export default function SessionDetailRoute() {
  const { id } = useParams();
  const sessionId = Number(id);
  const navigate = useNavigate();
  const location = useLocation();
  const refreshLibrary = useLibraryStore((s) => s.refresh);
  const transcriptScale = useConfigStore((s) => s.transcriptScale);
  // Reuse the live-translate target language so it stays consistent (persisted).
  const targetLanguage = useConfigStore((s) => s.targetLanguage);
  const setTargetLanguage = useConfigStore((s) => s.setTargetLanguage);
  const autoSummarizeOnFinish = useConfigStore((s) => s.autoSummarizeOnFinish);

  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  // AI-summary output language (a code or "auto"); mirrors the global setting.
  const [summaryLang, setSummaryLang] = useState('auto');
  const [editingSpeaker, setEditingSpeaker] = useState<number | null>(null);
  const [speakerDraft, setSpeakerDraft] = useState('');
  // Batch transcript translation: in-flight flag, progress counter, and the set
  // of segment indices currently being translated (for the per-line "Translating…").
  const [translating, setTranslating] = useState(false);
  const [tProgress, setTProgress] = useState({ done: 0, total: 0 });
  const [tPending, setTPending] = useState<Set<number>>(new Set());
  const [err, setErr] = useState('');
  // Guards the one-shot auto-summarize on finish; reset per session in the loader.
  const autoSummarizeTried = useRef(false);
  // In-transcript find (client-side over the already-loaded segments).
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findPos, setFindPos] = useState(0);
  const findInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const speakers = useMemo(() => distinctSpeakers(detail?.segments ?? []), [detail]);
  // Indices of transcript lines matching the find query (text or translation).
  const findMatches = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q) return [];
    const out: number[] = [];
    (detail?.segments ?? []).forEach((s, i) => {
      if (s.text.toLowerCase().includes(q) || s.translation?.toLowerCase().includes(q)) {
        out.push(i);
      }
    });
    return out;
  }, [findQuery, detail]);

  const scrollToMatch = (pos: number) => {
    const segIdx = findMatches[pos];
    if (segIdx == null) return;
    transcriptRef.current
      ?.querySelector(`[data-find-line="${segIdx}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const stepMatch = (delta: number) => {
    if (findMatches.length === 0) return;
    const next = (findPos + delta + findMatches.length) % findMatches.length;
    setFindPos(next);
    scrollToMatch(next);
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setEditing(false);
    setConfirmDelete(false);
    setSummarizing(false);
    setEditingSpeaker(null);
    setTranslating(false);
    setTProgress({ done: 0, total: 0 });
    setTPending(new Set());
    setErr('');
    autoSummarizeTried.current = false;
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

  // Load the persisted AI-summary output language once so the dropdown reflects
  // the global setting (Settings → Language). Changing it here writes back.
  useEffect(() => {
    getSummaryLanguage()
      .then(setSummaryLang)
      .catch(() => {});
  }, []);

  // Focus the find input when the find bar opens.
  useEffect(() => {
    if (findOpen) findInputRef.current?.focus();
  }, [findOpen]);

  // Reset to the first match and scroll to it whenever the find query changes.
  useEffect(() => {
    setFindPos(0);
    if (findQuery.trim() && findMatches.length > 0) scrollToMatch(0);
  }, [findQuery]);

  // Ctrl/Cmd+F opens the in-transcript find bar; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
        findInputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setFindOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // Rename a speaker label across the whole session, then optimistically rewrite
  // the matching segments so the panel + transcript update without a refetch.
  async function saveSpeaker(entry: SpeakerEntry) {
    const next = speakerDraft.trim();
    setEditingSpeaker(null);
    if (!detail || !next || next === entry.display) return;
    try {
      await renameSpeaker(sessionId, entry.stored, next);
      setDetail({
        ...detail,
        segments: detail.segments.map((s) =>
          (s.speaker ?? null) === entry.stored ? { ...s, speaker: next } : s,
        ),
      });
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
      // Resolve the chosen summary-language code to what the backend expects:
      // "auto" verbatim, or a human-readable language name for a specific one.
      const target = summaryLang === 'auto' ? 'auto' : languageLabel(summaryLang);
      await summarizeSession(sessionId, target);
      // Refetch so summary, model, and timestamp come straight from the DB.
      const fresh = await getSession(sessionId);
      if (fresh) setDetail(fresh);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSummarizing(false);
    }
  }

  // Auto-summarize once when arriving straight from a just-finished recording
  // (MainApp passes `state.autoSummarize`), when enabled and the active provider's
  // key is set. Opening an old session from history carries no such state, so it
  // won't fire there; a missing key is skipped silently (manual button stays).
  useEffect(() => {
    if (autoSummarizeTried.current) return;
    const wantsAuto =
      (location.state as { autoSummarize?: boolean } | null)?.autoSummarize === true;
    if (!wantsAuto || !autoSummarizeOnFinish) return;
    if (loading || !detail || detail.session.summary || detail.segments.length === 0) return;
    autoSummarizeTried.current = true;
    void (async () => {
      try {
        if (await hasApiKey(await getAiProvider())) await doSummarize();
      } catch {
        /* ignore — the manual "Finish & Summarize" button remains available */
      }
    })();
    // doSummarize is read fresh from the closure; the ref keeps this one-shot.
  }, [loading, detail, autoSummarizeOnFinish, location.state]);

  function onSummaryLang(code: string) {
    setSummaryLang(code);
    // Persist to the global app setting so the choice is remembered everywhere.
    void setSummaryLanguage(code).catch(() => {});
  }

  // Translate every saved transcript line into the selected target language via
  // the active AI provider. `translate_segment` is idempotent (re-running only
  // re-translates lines not yet in the target language), and persists each result
  // to the DB, so we just mirror it into local state for a progressive fill-in.
  // A different target overwrites a line's previous translation (single column).
  async function doTranslate() {
    if (!detail || translating) return;
    setErr('');
    const targetName = languageLabel(targetLanguage);

    // Lines that still need work (skip empty and already-in-target lines).
    const work: number[] = [];
    detail.segments.forEach((s, i) => {
      if (!s.text.trim()) return;
      if (s.translation && s.translationLang === targetName) return;
      work.push(i);
    });
    if (work.length === 0) return;

    setTranslating(true);
    setTProgress({ done: 0, total: work.length });
    setTPending(new Set(work));
    let failed = 0;

    const sid = sessionId;
    const translateOne = async (i: number) => {
      const seg = detail.segments[i];
      try {
        const translated = await translateSegment(sid, seg.segmentId, seg.text, targetName);
        setDetail((prev) => {
          if (!prev) return prev;
          const next = prev.segments.slice();
          next[i] = { ...next[i], translation: translated, translationLang: targetName };
          return { ...prev, segments: next };
        });
      } catch (e) {
        failed += 1;
        throw e;
      } finally {
        setTPending((prev) => {
          const n = new Set(prev);
          n.delete(i);
          return n;
        });
        setTProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    };

    // Run the first line alone so a fatal error (e.g. missing API key) aborts the
    // whole batch instead of firing one failing request per line.
    try {
      await translateOne(work[0]);
    } catch (e) {
      setErr(String(e));
      setTranslating(false);
      setTPending(new Set());
      return;
    }

    // Translate the rest with a small concurrency pool; per-line errors are
    // tolerated (the line is just left untranslated and can be retried).
    const rest = work.slice(1);
    let cursor = 0;
    const worker = async () => {
      while (cursor < rest.length) {
        const idx = rest[cursor++];
        try {
          await translateOne(idx);
        } catch {
          /* tolerated — counted in `failed` */
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(TRANSLATE_CONCURRENCY, rest.length) }, worker));

    setTranslating(false);
    if (failed > 0) setErr(`${failed} line(s) failed to translate — try again.`);
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
            <h2 className="m-0 min-w-[12rem] flex-1 text-[19px] font-semibold break-words text-fg">
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
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(255,93,93,0.5)] bg-[rgba(255,93,93,0.16)] px-[11px] py-1.5 text-[12.5px] whitespace-nowrap text-[#ffb4b4] shadow-liquid hover:border-[rgba(255,93,93,0.65)] hover:bg-[rgba(255,93,93,0.26)] hover:text-[#ffd9d9]"
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

      {session.videoPath && (
        <section className="mb-[22px] overflow-hidden rounded-md border border-glass-border bg-black/30">
          <video
            controls
            src={convertFileSrc(session.videoPath)}
            className="block max-h-[420px] w-full bg-black"
          />
        </section>
      )}

      {segments.length > 0 && (
        <section className="mb-[22px] rounded-md border border-glass-border bg-[rgba(110,168,254,0.07)] px-[18px] py-4">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2">
            <h3 className="m-0 inline-flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-accent uppercase">
              <HugeiconsIcon icon={IconAi} size={14} strokeWidth={1.8} aria-hidden={true} />
              AI Summary
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              <select
                className={SELECT_CLS}
                value={summaryLang}
                onChange={(e) => onSummaryLang(e.target.value)}
                disabled={summarizing}
                title="Summary output language"
                aria-label="Summary output language"
              >
                {SUMMARY_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
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

      {segments.length > 0 && (
        <section className="mb-4 rounded-md border border-glass-border bg-[rgba(255,255,255,0.04)] px-[18px] py-3.5">
          <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-fg-faint uppercase">
            <HugeiconsIcon icon={IconSpeaker} size={14} strokeWidth={1.8} aria-hidden={true} />
            Speakers
          </h3>
          <div className="flex flex-wrap gap-2">
            {speakers.map((sp, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 rounded-full border border-glass-border bg-[rgba(255,255,255,0.06)] py-1 pr-1.5 pl-2.5"
              >
                {editingSpeaker === i ? (
                  <input
                    className="w-[120px] rounded-sm border border-accent bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 text-[12.5px] text-fg outline-none"
                    value={speakerDraft}
                    autoFocus
                    onChange={(e) => setSpeakerDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveSpeaker(sp);
                      if (e.key === 'Escape') setEditingSpeaker(null);
                    }}
                    onBlur={() => void saveSpeaker(sp)}
                  />
                ) : (
                  <>
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: speakerColor(sp.source, sp.display) }}
                      aria-hidden={true}
                    />
                    <span className="text-[12.5px] font-medium text-fg">{sp.display}</span>
                    <span className="text-[11px] text-fg-faint">{sp.count}</span>
                    <button
                      className="inline-flex cursor-pointer items-center rounded-full p-1 text-fg-faint hover:bg-hover hover:text-fg"
                      aria-label={`Rename ${sp.display}`}
                      onClick={() => {
                        setSpeakerDraft(sp.display);
                        setEditingSpeaker(i);
                      }}
                    >
                      <HugeiconsIcon
                        icon={IconRename}
                        size={13}
                        strokeWidth={1.8}
                        aria-hidden={true}
                      />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {segments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-fg-faint">
          <HugeiconsIcon icon={IconNoTranscript} size={32} strokeWidth={1.5} aria-hidden={true} />
          <p className="text-[13px]">No transcript saved for this session.</p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2">
            <h3 className="m-0 inline-flex items-center gap-1.5 text-[12px] tracking-[0.06em] text-fg-faint uppercase">
              <HugeiconsIcon icon={IconLanguage} size={14} strokeWidth={1.8} aria-hidden={true} />
              Transcript
            </h3>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(255,192,77,0.45)] bg-[rgba(255,192,77,0.1)] px-[11px] py-1.5 text-[12.5px] font-medium whitespace-nowrap text-[#ffc04d] shadow-liquid hover:bg-[rgba(255,192,77,0.18)]"
                onClick={() => setFindOpen((v) => !v)}
                aria-label="Find in transcript"
                title="Find in transcript (Ctrl/Cmd+F)"
              >
                <HugeiconsIcon icon={IconSearch} size={14} strokeWidth={1.8} aria-hidden={true} />
                Find
              </button>
              <select
                className={SELECT_CLS}
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                disabled={translating}
                title="Translate transcript to"
                aria-label="Translate transcript to"
              >
                {TRANSLATE_TARGETS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[rgba(167,139,250,0.5)] bg-[rgba(167,139,250,0.16)] px-[11px] py-1.5 text-[12.5px] font-medium whitespace-nowrap text-[#d6c6ff] shadow-liquid enabled:hover:bg-[rgba(167,139,250,0.26)] disabled:cursor-default disabled:opacity-60"
                onClick={() => void doTranslate()}
                disabled={translating}
              >
                {translating ? (
                  `Translating ${tProgress.done}/${tProgress.total}…`
                ) : (
                  <>
                    <HugeiconsIcon
                      icon={IconLanguage}
                      size={14}
                      strokeWidth={1.8}
                      aria-hidden={true}
                    />
                    Translate
                  </>
                )}
              </button>
            </div>
          </div>
          {findOpen && (
            <div className="mb-3 flex items-center gap-2 rounded-sm border border-[rgba(255,192,77,0.4)] bg-[rgba(255,192,77,0.08)] px-2.5 py-2">
              <HugeiconsIcon
                icon={IconSearch}
                size={14}
                strokeWidth={1.8}
                className="shrink-0 text-[#ffc04d]"
                aria-hidden={true}
              />
              <input
                ref={findInputRef}
                type="text"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') stepMatch(e.shiftKey ? -1 : 1);
                  if (e.key === 'Escape') setFindOpen(false);
                }}
                placeholder="Find in transcript…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-fg caret-[#ffc04d] outline-none placeholder:text-fg-faint"
              />
              <span className="shrink-0 text-[11.5px] text-fg-faint">
                {findMatches.length > 0
                  ? `${findPos + 1}/${findMatches.length}`
                  : findQuery.trim()
                    ? 'No matches'
                    : ''}
              </span>
              <button
                className="cursor-pointer rounded-sm px-1.5 py-0.5 text-[14px] leading-none text-[rgba(255,192,77,0.85)] hover:bg-[rgba(255,192,77,0.18)] hover:text-[#ffc04d] disabled:opacity-40"
                onClick={() => stepMatch(-1)}
                disabled={findMatches.length === 0}
                aria-label="Previous match"
              >
                ↑
              </button>
              <button
                className="cursor-pointer rounded-sm px-1.5 py-0.5 text-[14px] leading-none text-[rgba(255,192,77,0.85)] hover:bg-[rgba(255,192,77,0.18)] hover:text-[#ffc04d] disabled:opacity-40"
                onClick={() => stepMatch(1)}
                disabled={findMatches.length === 0}
                aria-label="Next match"
              >
                ↓
              </button>
              <button
                className="cursor-pointer rounded-sm p-1 text-[rgba(255,192,77,0.85)] hover:bg-[rgba(255,192,77,0.18)] hover:text-[#ffc04d]"
                onClick={() => setFindOpen(false)}
                aria-label="Close find"
              >
                <HugeiconsIcon icon={IconClose} size={13} strokeWidth={2} aria-hidden={true} />
              </button>
            </div>
          )}
          <div ref={transcriptRef} className="flex flex-col gap-3">
            {segments.map((s, i) => {
              const isCurrent = findOpen && findMatches[findPos] === i;
              const find = findOpen && findQuery.trim() !== '';
              return (
                <div
                  key={i}
                  data-find-line={i}
                  className={clsx(
                    'flex flex-col gap-[3px]',
                    isCurrent &&
                      '-mx-2 rounded-sm bg-[rgba(255,192,77,0.14)] px-2 py-1 ring-1 ring-[rgba(255,192,77,0.5)]',
                  )}
                >
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
                    {find ? highlightText(s.text, findQuery) : s.text}
                  </span>
                  {s.translation ? (
                    <span
                      className="mt-0.5 border-l-2 border-[rgba(255,192,77,0.55)] pl-2 text-[#ffc04d]"
                      style={{ fontSize: `${13 * transcriptScale}px` }}
                    >
                      {find ? highlightText(s.translation, findQuery) : s.translation}
                    </span>
                  ) : tPending.has(i) ? (
                    <span
                      className="mt-0.5 border-l-2 border-[rgba(255,192,77,0.35)] pl-2 text-fg-faint italic"
                      style={{ fontSize: `${13 * transcriptScale}px` }}
                    >
                      Translating…
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
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
