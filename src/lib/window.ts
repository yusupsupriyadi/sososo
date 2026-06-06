import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';

/** Thin wrappers around the current window. Each guards against running outside
 * a Tauri webview (e.g. plain `vite dev` in a browser) so handlers never throw. */

const RECORDING_SIZE = new LogicalSize(460, 600);
const NORMAL_SIZE = new LogicalSize(1040, 720);

/** Shrink to a compact, always-on-top floating widget for the recording view.
 *  The window has no native shadow (see tauri.conf.json `shadow: false`), so the
 *  transparent gaps don't read as one enclosing box — the pill and panel float
 *  as separate shapes. */
export async function enterRecordingWindow(): Promise<void> {
  try {
    const w = getCurrentWindow();
    await w.setSize(RECORDING_SIZE);
    await w.center();
    await w.setAlwaysOnTop(true);
  } catch (e) {
    console.warn('enterRecordingWindow failed (not in Tauri?)', e);
  }
}

/** Restore the full main-window size when leaving the recording view. */
export async function exitRecordingWindow(): Promise<void> {
  try {
    const w = getCurrentWindow();
    await w.setAlwaysOnTop(false);
    await w.setSize(NORMAL_SIZE);
    await w.center();
  } catch (e) {
    console.warn('exitRecordingWindow failed (not in Tauri?)', e);
  }
}

export async function closeSelf(): Promise<void> {
  try {
    await getCurrentWindow().close();
  } catch (e) {
    console.warn('closeSelf failed (not in Tauri?)', e);
  }
}

export async function minimizeSelf(): Promise<void> {
  try {
    await getCurrentWindow().minimize();
  } catch (e) {
    console.warn('minimizeSelf failed (not in Tauri?)', e);
  }
}

export async function setAlwaysOnTop(value: boolean): Promise<void> {
  try {
    await getCurrentWindow().setAlwaysOnTop(value);
  } catch (e) {
    console.warn('setAlwaysOnTop failed (not in Tauri?)', e);
  }
}

export async function startDragging(): Promise<void> {
  try {
    await getCurrentWindow().startDragging();
  } catch (e) {
    console.warn('startDragging failed (not in Tauri?)', e);
  }
}
