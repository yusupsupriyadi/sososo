import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { listSessions } from "../../lib/ipc";
import { useSessionStore } from "../../state/sessionStore";
import { useLibraryStore } from "../../state/libraryStore";
import { formatDateTime } from "../../lib/format";
import type { SessionSummary } from "../../types/domain";

export default function SessionSidebar() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const state = useSessionStore((s) => s.state);
  const revision = useLibraryStore((s) => s.revision);

  // Load on mount and refresh whenever a session ends (so a just-finished
  // recording shows up) or a mutation bumps `revision` (delete/rename). Skip
  // while recording (the list won't change). The sidebar is mounted
  // persistently, so it can't rely on remounting to pick up changes.
  useEffect(() => {
    if (state === "recording" || state === "starting") return;
    listSessions()
      .then(setSessions)
      .catch(() => {});
  }, [state, revision]);

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1.5 rounded-lg liquid-glass p-3">
      <NavLink
        to="/main"
        end
        className="mb-1.5 block rounded-sm border border-[rgba(255,255,255,0.3)] bg-[rgba(110,168,254,0.22)] px-2.5 py-[9px] text-left text-[13px] font-semibold text-[#dbe8ff] no-underline shadow-liquid hover:bg-[rgba(110,168,254,0.32)]"
      >
        ＋ New recording
      </NavLink>
      <div className="px-1.5 pt-1 pb-2 text-[11px] uppercase tracking-[0.06em] text-fg-faint">
        History
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {sessions.length === 0 ? (
          <p className="p-1.5 text-[12px] leading-[1.5] text-fg-faint">
            No recordings yet.
          </p>
        ) : (
          sessions.map((s) => (
            <NavLink
              key={s.id}
              to={`/main/session/${s.id}`}
              title={s.title}
              className={({ isActive }) =>
                clsx(
                  "flex cursor-pointer flex-col items-start gap-0.5 rounded-sm px-2.5 py-2 text-left text-fg no-underline transition-colors duration-[120ms] hover:bg-hover",
                  isActive ? "bg-active" : "bg-transparent",
                )
              }
            >
              <span className="text-[13px]">{s.title}</span>
              <span className="text-[11px] text-fg-faint">
                {formatDateTime(s.startedAt)} · {s.segmentCount} lines
              </span>
            </NavLink>
          ))
        )}
      </nav>
      <NavLink
        to="/main/settings"
        className={({ isActive }) =>
          clsx(
            "mt-1.5 block cursor-pointer rounded-sm border border-glass-border px-2.5 py-[9px] text-left text-[13px] no-underline hover:bg-hover hover:text-fg",
            isActive
              ? "bg-hover text-fg"
              : "bg-[rgba(255,255,255,0.04)] text-fg-dim",
          )
        }
      >
        ⚙ Settings
      </NavLink>
    </aside>
  );
}
