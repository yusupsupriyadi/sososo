import { closeSelf, minimizeSelf } from "../../lib/window";

export default function Titlebar() {
  return (
    <header className="titlebar glass-strong" data-tauri-drag-region>
      <div className="flex items-center gap-2 text-[13px] font-semibold tracking-[0.02em]">
        <span className="brand-dot" />
        sososo
      </div>
      <span className="flex-1" />
      <button
        className="icon-btn"
        title="Minimize"
        onClick={() => void minimizeSelf()}
      >
        —
      </button>
      <button
        className="icon-btn danger"
        title="Tutup"
        onClick={() => void closeSelf()}
      >
        ✕
      </button>
    </header>
  );
}
