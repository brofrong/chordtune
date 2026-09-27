/// <reference types="bun" />

import { expect, test } from 'bun:test';
import { TRPCClientError } from '@trpc/client';

import { isNetworkError, playRoute } from './play-route';

test('preview never counts', () => {
  expect(
    playRoute({ preview: true, online: true, signedIn: true, hasToken: true, canQueue: true }),
  ).toBe('skip');
});

test('offline with a stored token queues even before the session loads', () => {
  expect(
    playRoute({ preview: false, online: false, signedIn: false, hasToken: true, canQueue: true }),
  ).toBe('queue');
});

test('guests are asked to sign in', () => {
  expect(
    playRoute({ preview: false, online: true, signedIn: false, hasToken: false, canQueue: true }),
  ).toBe('auth');
  expect(
    playRoute({ preview: false, online: false, signedIn: false, hasToken: false, canQueue: true }),
  ).toBe('auth');
});

test('online signed-in users send', () => {
  expect(
    playRoute({ preview: false, online: true, signedIn: true, hasToken: true, canQueue: true }),
  ).toBe('send');
});

test('only transport failures count as network errors', () => {
  expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
  expect(isNetworkError(TRPCClientError.from(new TypeError('Failed to fetch')))).toBe(true);
  const notFound = new TRPCClientError('Arrangement not found', {
    result: { error: { code: -32004, message: 'x', data: { code: 'NOT_FOUND', httpStatus: 404 } } },
  } as never);
  expect(isNetworkError(notFound)).toBe(false);
});
