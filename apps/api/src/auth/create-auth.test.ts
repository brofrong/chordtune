import { describe, expect, test } from 'bun:test';

import { createTestAuth } from '../test/auth';

describe('createAuth', () => {
  test('initialises with Google, VK and Yandex all configured', async () => {
    const { auth } = await createTestAuth({
      google: { clientId: 'g', clientSecret: 'gs' },
      vk: { clientId: 'v', clientSecret: 'vs' },
      yandex: { clientId: 'y', clientSecret: 'ys' },
    });
    await expect(auth.api.getSession({ headers: new Headers() })).resolves.toBeNull();
  });
});
