import { describe, expect, test } from 'bun:test';

import {
  DEMO_DURATION,
  DEMO_LINES,
  DEMO_SUMMARY,
  DEMO_TIMING,
  FINISH_AT,
  SUMMARY_AT,
  demoFrame,
  formatClock,
  lineSchedule,
} from './demo';

const schedule = lineSchedule();

describe('lineSchedule', () => {
  test('lines start after the connect phase, in order, without overlap', () => {
    expect(schedule[0].start).toBeCloseTo(DEMO_TIMING.connect);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].start).toBeGreaterThan(schedule[i - 1].finalAt);
    }
  });

  test('a line finalizes one settle beat after its last word', () => {
    const words = DEMO_LINES[0].text.split(' ').length;
    const expected = schedule[0].start + words * DEMO_TIMING.word + DEMO_TIMING.settle;
    expect(schedule[0].finalAt).toBeCloseTo(expected);
  });

  test('finishing starts after the last line, the summary after finishing', () => {
    expect(FINISH_AT).toBeGreaterThan(schedule[schedule.length - 1].finalAt);
    expect(SUMMARY_AT).toBeCloseTo(FINISH_AT + DEMO_TIMING.finish);
    expect(DEMO_DURATION).toBeCloseTo(SUMMARY_AT + DEMO_TIMING.summary);
  });
});

describe('demoFrame', () => {
  test('starts connecting with an empty transcript', () => {
    const f = demoFrame(0, null);
    expect(f.phase).toBe('connecting');
    expect(f.lines).toEqual([]);
    expect(f.elapsed).toBe(0);
  });

  test('streams the first line word by word as interim', () => {
    const f = demoFrame(schedule[0].start + 0.01, null);
    expect(f.phase).toBe('recording');
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]).toMatchObject({ index: 0, words: 1, final: false });

    const later = demoFrame(schedule[0].start + DEMO_TIMING.word * 2 + 0.01, null);
    expect(later.lines[0].words).toBe(3);
  });

  test('finalizes a line once its settle beat has passed', () => {
    const words = DEMO_LINES[0].text.split(' ').length;
    const before = demoFrame(schedule[0].finalAt - 0.01, null);
    expect(before.lines[0]).toMatchObject({ words, final: false });
    const after = demoFrame(schedule[0].finalAt, null);
    expect(after.lines[0].final).toBe(true);
  });

  test('never shows a line before it starts', () => {
    const f = demoFrame(schedule[1].start - 0.01, null);
    expect(f.lines.map((l) => l.index)).toEqual([0]);
  });

  test('shows no translation while translate is off', () => {
    const f = demoFrame(FINISH_AT - 0.01, null);
    expect(f.lines.every((l) => l.translation === 'none')).toBe(true);
  });

  test('translates final lines: pending first, then done', () => {
    const pending = demoFrame(schedule[0].finalAt + 0.01, 0);
    expect(pending.lines[0].translation).toBe('pending');
    const done = demoFrame(schedule[0].finalAt + DEMO_TIMING.translate, 0);
    expect(done.lines[0].translation).toBe('done');
  });

  test('only translates lines finalized after translate was switched on', () => {
    const switchedOn = schedule[0].finalAt + 0.1;
    const f = demoFrame(FINISH_AT - 0.01, switchedOn);
    expect(f.lines[0].translation).toBe('none');
    expect(f.lines[1].translation).toBe('done');
  });

  test('keeps interim lines untranslated', () => {
    const f = demoFrame(schedule[1].start + 0.01, 0);
    expect(f.lines[1]).toMatchObject({ final: false, translation: 'none' });
  });

  test('moves through finishing into finished with every line final', () => {
    expect(demoFrame(FINISH_AT, null).phase).toBe('finishing');
    const f = demoFrame(SUMMARY_AT, null);
    expect(f.phase).toBe('finished');
    expect(f.lines).toHaveLength(DEMO_LINES.length);
    expect(f.lines.every((l) => l.final)).toBe(true);
  });

  test('the clock counts recording seconds and freezes when finishing', () => {
    expect(demoFrame(DEMO_TIMING.connect + 3.5, null).elapsed).toBe(3);
    const frozen = demoFrame(FINISH_AT, null).elapsed;
    expect(demoFrame(DEMO_DURATION, null).elapsed).toBe(frozen);
  });

  test('clamps time outside the loop', () => {
    expect(demoFrame(-5, null)).toEqual(demoFrame(0, null));
    expect(demoFrame(DEMO_DURATION + 10, null)).toEqual(demoFrame(DEMO_DURATION, null));
  });
});

describe('formatClock', () => {
  test('formats seconds as mm:ss', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(75)).toBe('01:15');
    expect(formatClock(3725)).toBe('62:05');
  });
});

describe('demo copy', () => {
  test('every line has a speaker, text and a translation', () => {
    for (const line of DEMO_LINES) {
      expect(line.speaker.length).toBeGreaterThan(0);
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.translation.length).toBeGreaterThan(0);
    }
  });

  test('uses no em dash anywhere (site copy rule)', () => {
    const copy = [
      ...DEMO_LINES.flatMap((l) => [l.text, l.translation]),
      ...DEMO_SUMMARY.points,
      DEMO_SUMMARY.action,
    ].join(' ');
    expect(copy).not.toContain('—');
  });
});
