import { GeistSans } from 'geist/font/sans';

import { LocaleRedirect } from '@/components/locale-redirect';

export default function RootPage() {
  return (
    <html lang="ru" className={`dark ${GeistSans.variable}`}>
      <body>
        <LocaleRedirect />
      </body>
    </html>
  );
}
