import { describe, expect, test } from 'bun:test';

import { describeUserAgent } from './user-agent';

describe('describeUserAgent', () => {
  test('common browsers and systems', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      ),
    ).toEqual({ browser: 'Safari', os: 'macOS', mobile: false });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      ),
    ).toEqual({ browser: 'Chrome', os: 'Android', mobile: true });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      ),
    ).toEqual({ browser: 'Edge', os: 'Windows', mobile: false });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      ),
    ).toEqual({ browser: null, os: 'iOS', mobile: true });
    expect(
      describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'),
    ).toEqual({ browser: 'Firefox', os: 'Linux', mobile: false });
  });

  test('unknown or missing', () => {
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null, mobile: false });
  });
});
