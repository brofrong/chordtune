/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parse } from '@chordtune/chord-sheet';

import { zenLines, zenPosition } from './zen-timing';
import {
  clampNudge,
  ownsSpaceKey,
  resolveZenMode,
  rowEmphasis,
  sectionStrip,
  seekTime,
} from './zen-view';

const doc = (source: string) => parse(source).doc;
// 60 BPM, no rhythms: one chord = one 4/4 bar = 4 s.
const SONG = doc(
  '[Куплет]\n${Am}a ${F}b\nпросто текст\n${C}c ${G}d\n[Припев]\n${Em}e ${Em}f ${D}g',
);
const LINES = zenLines(SONG, [], 60);
const at = (time: number) => sectionStrip(SONG, LINES, zenPosition(LINES, time));

describe('resolveZenMode', () => {
  test('listener, then author, then auto by chord count', () => {
    const four = doc('${Am}a ${F}b ${C}c ${G}d ${Am}e');
    const five = doc('${Am}a ${F}b ${C}c ${G}d ${E}e');
    expect(resolveZenMode('inline', 'strip', four)).toBe('inline');
    expect(resolveZenMode(null, 'inline', four)).toBe('inline');
    expect(resolveZenMode(null, null, four)).toBe('strip');
    expect(resolveZenMode(null, null, five)).toBe('inline');
  });

  test('a song without chords is never auto-resolved to the strip', () => {
    const tabOnly = doc('{start_of_tab}\ne|--0--|\n{end_of_tab}');
    expect(resolveZenMode(null, null, tabOnly)).toBe('inline');
    expect(resolveZenMode(null, 'strip', tabOnly)).toBe('strip');
  });
});

describe('ownsSpaceKey', () => {
  const element = (tagName: string, attributes: Record<string, string> = {}, editable = false) => ({
    tagName,
    isContentEditable: editable,
    getAttribute: (name: string) => attributes[name] ?? null,
  });

  test('buttons, form fields, links and role=button rows activate on Space themselves', () => {
    expect(ownsSpaceKey(element('BUTTON'))).toBe(true);
    expect(ownsSpaceKey(element('INPUT'))).toBe(true);
    expect(ownsSpaceKey(element('TEXTAREA'))).toBe(true);
    expect(ownsSpaceKey(element('SELECT'))).toBe(true);
    expect(ownsSpaceKey(element('A', { href: '/' }))).toBe(true);
    expect(ownsSpaceKey(element('DIV', { role: 'button' }))).toBe(true);
    expect(ownsSpaceKey(element('DIV', { role: 'radio' }))).toBe(true);
    expect(ownsSpaceKey(element('DIV', {}, true))).toBe(true);
  });

  test('the page itself and plain elements leave Space to zen', () => {
    expect(ownsSpaceKey(null)).toBe(false);
    expect(ownsSpaceKey(element('BODY'))).toBe(false);
    expect(ownsSpaceKey(element('DIV', { role: 'dialog' }))).toBe(false);
    expect(ownsSpaceKey(element('A'))).toBe(false);
  });
});

describe('rowEmphasis', () => {
  test('by distance from the current row', () => {
    expect([3, 4, 5, 6, 9, 2].map((row) => rowEmphasis(row, 3))).toEqual([
      'current',
      'next',
      'after',
      'later',
      'later',
      'past',
    ]);
  });
});

describe('sectionStrip', () => {
  test('the section chords in order, the sounding one and the next different one', () => {
    expect(at(0)).toEqual({ chords: ['Am', 'F', 'C', 'G'], current: 0, next: 1 });
    expect(at(4)).toEqual({ chords: ['Am', 'F', 'C', 'G'], current: 1, next: 2 });
  });

  test('no ring when the next chord is outside the strip', () => {
    expect(at(12)).toEqual({ chords: ['Am', 'F', 'C', 'G'], current: 3, next: null });
  });

  test('a repeated chord rings the next different one', () => {
    expect(at(16)).toEqual({ chords: ['Em', 'D'], current: 0, next: 1 });
  });
});

describe('seekTime', () => {
  // `parse` drops the empty section before the first header: «Куплет» is section 0.
  test('a line starts at its first chord, a chord at itself', () => {
    expect(seekTime(LINES, 0, 0)).toBe(0);
    expect(seekTime(LINES, 0, 0, 2)).toBe(4);
    expect(seekTime(LINES, 0, 2, 0)).toBe(8);
  });

  test('an untimed line starts at the next timed line; past the end there is nothing', () => {
    expect(seekTime(LINES, 0, 1)).toBe(8);
    expect(seekTime(LINES, 1, 5)).toBeNull();
  });
});

describe('clampNudge', () => {
  test('within bounds, the nudge passes through unchanged', () => {
    expect(clampNudge(0, 100, 800, 2000)).toBe(100);
  });

  test('a drag down is capped so a sliver of a row stays on screen at the top', () => {
    expect(clampNudge(0, 5000, 800, 2000)).toBe(760);
    expect(clampNudge(-500, 5000, 800, 2000)).toBe(1260);
  });

  test('a drag up is capped so a sliver of a row stays on screen at the bottom', () => {
    expect(clampNudge(0, -5000, 800, 2000)).toBe(-1960);
  });

  test('content shorter than the viewport is clamped the same way', () => {
    expect(clampNudge(0, 1000, 800, 50)).toBe(760);
  });

  test('a viewport too small to leave room for a sliver on both ends is not clamped', () => {
    expect(clampNudge(0, 1000, 30, 10)).toBe(1000);
  });
});
