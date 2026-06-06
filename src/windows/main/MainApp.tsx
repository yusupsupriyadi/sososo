import { useEffect, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useTranscriptStream } from '../../hooks/useTranscriptStream';
import { useSessionStore } from '../../state/sessionStore';
import { useTranscriptStore } from '../../state/transcriptStore';
import { useConfigStore } from '../../state/configStore';
import Titlebar from './Titlebar';
import SessionSidebar from './SessionSidebar';
import RecordingView from './RecordingView';
import LibraryRoute from './routes/LibraryRoute';
import SettingsRoute from './routes/SettingsRoute';
import SessionDetailRoute from './routes/SessionDetailRoute';

export default function MainApp() {
	useTranscriptStream();
	const state = useSessionStore((s) => s.state);
	const sessionId = useSessionStore((s) => s.sessionId);
	const uiScale = useConfigStore((s) => s.uiScale);
	const navigate = useNavigate();
	const prev = useRef(state);

	// While a session is active the whole window becomes the transcription view.
	const inSession =
		state === 'starting' ||
		state === 'recording' ||
		state === 'stopping' ||
		state === 'reconnecting';

	// When a session ends, jump to its detail (where the summary lives) if it
	// captured anything; otherwise fall back to the home/library view.
	useEffect(() => {
		if (prev.current !== 'stopped' && state === 'stopped') {
			const hasFinal = useTranscriptStore
				.getState()
				.segments.some((s) => s.isFinal);
			navigate(
				hasFinal && sessionId != null
					? `/main/session/${sessionId}`
					: '/main',
			);
		}
		prev.current = state;
	}, [state, sessionId, navigate]);

	// While a session is active the whole window becomes the floating
	// transcription widget (its own root, no titlebar/sidebar). The floating
	// widget is intentionally compact and not affected by the UI zoom.
	if (inSession) return <RecordingView />;

	return (
		// UI font size = CSS zoom on the shell. Counter-scale the shell to the
		// viewport (calc(100vw / N) × calc(100vh / N)) so zooming enlarges the
		// content but the shell still renders back to exactly the window size —
		// no overflow/clipping; the inner scroll areas handle the extra height.
		<div
			className='flex flex-col gap-2'
			style={{
				zoom: uiScale,
				width: `calc(100vw / ${uiScale})`,
				height: `calc(100vh / ${uiScale})`,
			}}
		>
			<Titlebar />
			<div className='flex min-h-0 flex-1 gap-2'>
				<SessionSidebar />
				<main className='min-w-0 flex-1 overflow-y-auto rounded-lg liquid-glass'>
					<Routes>
						<Route
							index
							element={<LibraryRoute />}
						/>
						<Route
							path='settings'
							element={<SettingsRoute />}
						/>
						<Route
							path='session/:id'
							element={<SessionDetailRoute />}
						/>
					</Routes>
				</main>
			</div>
		</div>
	);
}
