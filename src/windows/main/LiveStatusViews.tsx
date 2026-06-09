import clsx from 'clsx';
import { HugeiconsIcon } from '@hugeicons/react';
import { IconWave } from '../../lib/icons';

/**
 * Animated loaders for the live transcription widget's transitional states.
 * Purely presentational — the decision of which one to show lives in
 * `recordingStatus.ts` (`liveBodyState`). Each block is a centered column sized
 * for the compact floating widget; the animation is decorative (aria-hidden)
 * while the text carries the status for assistive tech (`role="status"`).
 */

/** Three softly-bouncing dots that inherit the surrounding text color. */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1', className)} aria-hidden={true}>
      {[0, 200, 400].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 animate-loading-dot rounded-full bg-current"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}

/** Five vertical bars breathing out of phase — a "live mic" equalizer motif. */
function EqualizerBars() {
  // Out-of-phase delays so the bars ripple rather than pulse in unison.
  const delays = [0, 180, 360, 120, 300];
  return (
    <div className="flex h-7 items-end gap-1" aria-hidden={true}>
      {delays.map((delay, i) => (
        <span
          key={i}
          className="h-full w-1.5 origin-bottom animate-eq-bar rounded-full bg-accent"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function StateBlock({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      className="m-auto flex flex-col items-center gap-3 px-4 text-center"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {children}
    </div>
  );
}

/**
 * `starting` (and the unreachable-for-now `reconnecting`): audio capture is
 * being set up and the Deepgram websocket opened. Pinging rings around an audio
 * glyph read as "establishing a live connection".
 */
export function ConnectingState({
  variant = 'connecting',
}: {
  variant?: 'connecting' | 'reconnecting';
}) {
  const reconnecting = variant === 'reconnecting';
  const title = reconnecting ? 'Reconnecting…' : 'Connecting…';
  const subtitle = reconnecting
    ? 'Lost the Deepgram stream — restoring it now.'
    : 'Setting up audio capture and linking to Deepgram.';
  return (
    <StateBlock label={title}>
      <div className="relative flex h-12 w-12 items-center justify-center" aria-hidden={true}>
        <span
          className={clsx(
            'absolute inset-0 animate-ping rounded-full',
            reconnecting ? 'bg-[#ffb454]/25' : 'bg-accent/25',
          )}
        />
        <span
          className={clsx(
            'absolute inset-1.5 animate-ping rounded-full [animation-delay:350ms]',
            reconnecting ? 'bg-[#ffb454]/20' : 'bg-accent/20',
          )}
        />
        <span
          className={clsx(
            'relative flex h-11 w-11 items-center justify-center rounded-full border border-glass-border',
            reconnecting ? 'bg-[#ffb454]/15 text-[#ffb454]' : 'bg-accent/15 text-accent',
          )}
        >
          <HugeiconsIcon icon={IconWave} size={20} strokeWidth={2} aria-hidden={true} />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[13.5px] font-semibold text-fg">{title}</span>
        <span className="text-[12px] text-fg-faint">{subtitle}</span>
      </div>
      <LoadingDots className={reconnecting ? 'text-[#ffb454]/70' : 'text-accent/70'} />
    </StateBlock>
  );
}

/**
 * `recording` with nothing transcribed yet: the stream is live and simply
 * waiting for sound. The equalizer makes "we're listening" unmistakable.
 */
export function ListeningState() {
  return (
    <StateBlock label="Listening">
      <EqualizerBars />
      <div className="flex flex-col gap-1">
        <span className="text-[13.5px] font-semibold text-fg">Listening…</span>
        <span className="text-[12px] text-fg-faint">
          Waiting for audio — start talking or play your meeting.
        </span>
      </div>
    </StateBlock>
  );
}

/** `stopping` with an empty transcript: finalizing and saving the session. */
export function FinishingState() {
  return (
    <StateBlock label="Finishing">
      <span
        className="h-7 w-7 animate-spin rounded-full border-2 border-glass-border border-t-accent"
        aria-hidden={true}
      />
      <div className="flex flex-col gap-1">
        <span className="text-[13.5px] font-semibold text-fg">Finishing…</span>
        <span className="text-[12px] text-fg-faint">Saving your transcript.</span>
      </div>
    </StateBlock>
  );
}
