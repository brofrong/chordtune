const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/YaBrowser\//, 'Yandex Browser'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Version\/[\d.]+ .*Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** Enough to tell sessions apart in a list; not a full user-agent parser. Order matters. */
export function describeUserAgent(ua: string | null | undefined) {
  if (!ua) {
    return { browser: null, os: null, mobile: false };
  }
  return {
    browser: BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null,
    os: SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null,
    mobile: /Mobile|iPhone|iPad|Android/.test(ua),
  };
}
