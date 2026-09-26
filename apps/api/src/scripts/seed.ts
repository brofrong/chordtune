import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { importObsidian } from '@chordtune/chord-sheet';
import { and, eq, sql } from 'drizzle-orm';

import { auth } from '../auth';
import { db } from '../db';
import { artist, song } from '../db/schema';
import { noopSearch } from '../search';
import { search } from '../search/client';
import { reindexAll } from '../search/documents';
import { saveArrangement } from '../services/save-arrangement';

const DEMO_EMAIL = 'demo@chordtune.local';
const DEMO_PASSWORD = 'demo-password-123';
const DEFAULT_DIR = join(import.meta.dir, '../../../../packages/chord-sheet/fixtures/obsidian');

async function demoUserId(): Promise<string> {
  const existing = await db.query.user.findFirst({ where: { email: DEMO_EMAIL } });
  if (existing) {
    return existing.id;
  }
  const { user: created } = await auth.api.signUpEmail({
    body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Demo' },
  });
  return created.id;
}

async function songExists(artistName: string, title: string): Promise<boolean> {
  const [row] = await db
    .select({ id: song.id })
    .from(song)
    .innerJoin(artist, eq(song.artistId, artist.id))
    .where(
      and(
        eq(sql`lower(${artist.name})`, artistName.toLowerCase()),
        eq(sql`lower(${song.title})`, title.toLowerCase()),
      ),
    );
  return Boolean(row);
}

const dir = resolve(process.argv[2] ?? DEFAULT_DIR);
const authorId = await demoUserId();

for (const fileName of readdirSync(dir).filter((name) => name.endsWith('.md'))) {
  const imported = importObsidian(readFileSync(join(dir, fileName), 'utf8'), fileName);
  if (await songExists(imported.artist, imported.title)) {
    console.log(`skip  ${imported.artist} — ${imported.title}`);
    continue;
  }
  await saveArrangement(db, noopSearch, {
    authorId,
    input: {
      artist: { name: imported.artist },
      song: { title: imported.title },
      content: imported.content,
      rhythms: imported.rhythms,
      capo: imported.capo,
      tempo: imported.tempo,
      key: null,
      notes: imported.notes,
    },
  });
  console.log(`added ${imported.artist} — ${imported.title}`);
}

const counts = await reindexAll(db, search);
console.log(`Indexed ${counts.artists} artists and ${counts.arrangements} arrangements`);
console.log(`Demo user: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
process.exit(0);
