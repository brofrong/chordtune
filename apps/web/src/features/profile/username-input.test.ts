import { describe, expect, test } from 'bun:test';

import { normalizeUsernameInput, usernameProblem } from './username-input';

describe('username input', () => {
  test('normalises as you type', () => {
    expect(normalizeUsernameInput('Vasya Pupkin!')).toBe('vasyapupkin');
    expect(normalizeUsernameInput('a'.repeat(40))).toHaveLength(30);
  });

  test('explains what is wrong', () => {
    expect(usernameProblem('ab')).toBe('short');
    expect(usernameProblem('admin')).toBe('reserved');
    expect(usernameProblem('vasya')).toBeNull();
  });
});
