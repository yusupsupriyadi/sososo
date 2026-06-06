import { closeSelf, minimizeSelf } from "../../lib/window";

const ICON_BTN =
  "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-sm bg-transparent text-[14px] leading-none text-fg-dim transition-colors duration-[120ms] active:bg-active";

export default function Titlebar() {
  return (
    <header
      className="flex items-center gap-2 rounded-md bg-glass-strong px-2.5 py-2"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.02em]">
        <span className="h-2.5 w-2.5 rounded-full bg-[linear-gradient(135deg,var(--color-accent),var(--color-accent-2))]" />
        sososo
      </div>
      <span className="flex-1" />
      <button
        className={`${ICON_BTN} hover:bg-hover hover:text-fg`}
        title="Minimize"
        onClick={() => void minimizeSelf()}
      >
        —
      </button>
      <button
        className={`${ICON_BTN} hover:bg-[rgba(255,93,93,0.22)] hover:text-[#ffd9d9]`}
        title="Tutup"
        onClick={() => void closeSelf()}
      >
        ✕
      </button>
    </header>
  );
}
