import { describe, expect, test } from 'bun:test';

import { liveBodyState, sessionStatusLabel } from './recordingStatus';

describe('sessionStatusLabel', () => {
  test('maps each active state to a human label', () => {
    expect(sessionStatusLabel('starting', false)).toBe('Connecting…');
    expect(sessionStatusLabel('recording', false)).toBe('Recording');
    expect(sessionStatusLabel('reconnecting', false)).toBe('Reconnecting…');
    expect(sessionStatusLabel('stopping', false)).toBe('Finishing…');
    expect(sessionStatusLabel('stopped', false)).toBe('Finished');
    expect(sessionStatusLabel('error', false)).toBe('Connection issue');
    expect(sessionStatusLabel('idle', false)).toBe('Idle');
  });

  test('pause wins over recording / reconnecting', () => {
    expect(sessionStatusLabel('recording', true)).toBe('Paused');
    expect(sessionStatusLabel('reconnecting', true)).toBe('Paused');
  });

  test('pause does not relabel non-running states', () => {
    // A stale `paused` flag must not hide that we are still connecting/finishing.
    expect(sessionStatusLabel('starting', true)).toBe('Connecting…');
    expect(sessionStatusLabel('stopping', true)).toBe('Finishing…');
  });
});

describe('liveBodyState', () => {
  test('any captured segment shows the transcript, even mid-teardown', () => {
    expect(liveBodyState('recording', 3)).toBe('transcript');
    expect(liveBodyState('stopping', 1)).toBe('transcript');
    expect(liveBodyState('reconnecting', 5)).toBe('transcript');
  });

  test('with no segments yet, each state picks its own loader', () => {
    expect(liveBodyState('starting', 0)).toBe('connecting');
    expect(liveBodyState('reconnecting', 0)).toBe('reconnecting');
    expect(liveBodyState('stopping', 0)).toBe('finishing');
    // Connected and live but silent so far → we are listening for audio.
    expect(liveBodyState('recording', 0)).toBe('listening');
  });
});
