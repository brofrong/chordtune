import { describe, expect, spyOn, test } from 'bun:test';

import { createMailer } from '.';

const mail = { to: 'a@test.local', subject: 'Code', text: '123456' };

describe('createMailer without SMTP', () => {
  test('logs the message in development', async () => {
    const info = spyOn(console, 'info').mockImplementation(() => {});
    try {
      await createMailer({ from: 'x' })(mail);
      expect(info).toHaveBeenCalledTimes(1);
    } finally {
      info.mockRestore();
    }
  });

  test('fails in production instead of logging the code', async () => {
    const info = spyOn(console, 'info').mockImplementation(() => {});
    try {
      await expect(createMailer({ from: 'x', production: true })(mail)).rejects.toThrow();
      expect(info).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
    }
  });
});
