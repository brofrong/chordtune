import { authClient } from '@/lib/auth-client';

type TelegramWidget = {
  Login: {
    auth: (
      options: { bot_id: string; request_access?: string; lang?: string },
      callback: (data: Record<string, unknown> | false) => void,
    ) => void;
  };
};

declare global {
  interface Window {
    Telegram?: TelegramWidget;
  }
}

const SCRIPT = 'https://telegram.org/js/telegram-widget.js?22';
let loading: Promise<TelegramWidget> | null = null;

/** The widget script, loaded once on first use rather than on every page. */
function loadWidget(): Promise<TelegramWidget> {
  if (window.Telegram?.Login) {
    return Promise.resolve(window.Telegram);
  }
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      window.Telegram?.Login ? resolve(window.Telegram) : reject(new Error('No Telegram widget'));
    script.onerror = () => {
      loading = null;
      reject(new Error('Telegram widget failed to load'));
    };
    document.head.append(script);
  });
  return loading;
}

/** Opens Telegram's own popup from our button; resolves with the signed fields or null if closed. */
export async function requestTelegramAuth(botId: string) {
  const widget = await loadWidget();
  return new Promise<Record<string, unknown> | null>((resolve) => {
    widget.Login.auth({ bot_id: botId, lang: document.documentElement.lang }, (data) =>
      resolve(data || null),
    );
  });
}

export async function openTelegramLogin(
  botId: string,
): Promise<{ error?: { code?: string } | null } | undefined> {
  const data = await requestTelegramAuth(botId).catch(() => null);
  if (!data) {
    return;
  }
  return authClient.$fetch('/telegram/sign-in', { method: 'POST', body: data });
}

export async function linkTelegram(
  botId: string,
): Promise<{ error?: { code?: string } | null } | undefined> {
  const data = await requestTelegramAuth(botId).catch(() => null);
  if (!data) {
    return;
  }
  return authClient.$fetch('/telegram/link', { method: 'POST', body: data });
}
