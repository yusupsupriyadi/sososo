import { useEffect, useRef } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { useTranscriptStream } from '../../hooks/useTranscriptStream';
import { useSessionStore } from '../../state/sessionStore';
import { useTranscriptStore } from '../../state/transcriptStore';
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
	// transcription widget (its own root, no titlebar/sidebar).
	if (inSession) return <RecordingView />;

	return (
		<div className='flex h-screen w-screen flex-col gap-2 p-2'>
			<Titlebar />
			<div className='flex min-h-0 flex-1 gap-2'>
				<SessionSidebar />
				<main className='glass min-w-0 flex-1 overflow-y-auto'>
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
