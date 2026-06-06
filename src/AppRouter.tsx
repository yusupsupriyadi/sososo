import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainApp from './windows/main/MainApp';

/**
 * Single-window app. The main window hosts the library, settings, and session
 * history; while a session is active it swaps to a full live-transcription view
 * (see `MainApp`). The legacy `#/overlay` shell has been removed.
 */
export default function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/main/*" element={<MainApp />} />
        <Route path="*" element={<Navigate to="/main" replace />} />
      </Routes>
    </HashRouter>
  );
}
