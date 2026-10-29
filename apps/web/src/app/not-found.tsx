import { GeistSans } from "geist/font/sans";
import Link from "next/link";

export default function NotFound() {
  return (
    <html lang="en" className={`dark ${GeistSans.variable}`}>
      <body className="grid min-h-dvh place-items-center">
        <div className="text-center">
          <p className="font-semibold text-6xl">404</p>
          <Link
            className="mt-4 inline-block text-muted-foreground underline"
            href="/"
          >
            ChordTune
          </Link>
        </div>
      </body>
    </html>
  );
}
