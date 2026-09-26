import { chordList, isRhythm, parse, type Rhythm, validate } from '@chordtune/chord-sheet';
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../db';
import { arrangement, artist, song } from '../db/schema';
import { slugify } from '../lib/translit';
import type { SearchIndex } from '../search';
import { syncArrangement } from '../search/documents';

export const MAX_CONTENT_LENGTH = 50_000;
export const MAX_RHYTHMS = 16;

export const arrangementInput = z.object({
  artist: z.union([
    z.object({ id: z.string() }),
    z.object({ name: z.string().trim().min(1).max(120) }),
  ]),
  song: z.union([
    z.object({ id: z.string() }),
    z.object({ title: z.string().trim().min(1).max(200) }),
  ]),
  content: z.string().max(MAX_CONTENT_LENGTH),
  rhythms: z
    .array(z.custom<Rhythm>(isRhythm, 'Invalid rhythm'))
    .max(MAX_RHYTHMS)
    .refine((rhythms) => new Set(rhythms.map((r) => r.key)).size === rhythms.length, {
      message: 'Rhythm keys must be unique',
    }),
  capo: z.number().int().min(0).max(12).nullable(),
  tempo: z.number().int().min(30).max(300).nullable(),
  key: z.string().trim().max(8).nullable(),
  notes: z.string().max(5_000),
});

export type ArrangementInput = z.infer<typeof arrangementInput>;

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** `base`, `base-2`, `base-3`… — the first one `taken` says is free. */
async function freeSlug(name: string, taken: (slug: string) => Promise<boolean>) {
  const base = slugify(name) || 'untitled';
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    if (!(await taken(slug))) {
      return slug;
    }
  }
}

async function resolveArtist(tx: Transaction, input: ArrangementInput['artist']) {
  if ('id' in input) {
    const found = await tx.query.artist.findFirst({ where: { id: input.id } });
    if (!found) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Artist not found' });
    }
    return found;
  }
  const [existing] = await tx
    .select()
    .from(artist)
    .where(eq(sql`lower(${artist.name})`, input.name.toLowerCase()));
  if (existing) {
    return existing;
  }
  const slug = await freeSlug(input.name, async (candidate) =>
    Boolean(await tx.$count(artist, eq(artist.slug, candidate))),
  );
  const [created] = await tx.insert(artist).values({ name: input.name, slug }).returning();
  if (!created) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
  }
  return created;
}

async function resolveSong(tx: Transaction, artistId: string, input: ArrangementInput['song']) {
  if ('id' in input) {
    const found = await tx.query.song.findFirst({ where: { id: input.id } });
    if (!found) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Song not found' });
    }
    if (found.artistId !== artistId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Song belongs to another artist' });
    }
    return found;
  }
  const [existing] = await tx
    .select()
    .from(song)
    .where(
      and(eq(song.artistId, artistId), eq(sql`lower(${song.title})`, input.title.toLowerCase())),
    );
  if (existing) {
    return existing;
  }
  const slug = await freeSlug(input.title, async (candidate) =>
    Boolean(await tx.$count(song, and(eq(song.artistId, artistId), eq(song.slug, candidate)))),
  );
  const [created] = await tx
    .insert(song)
    .values({ artistId, title: input.title, slug })
    .returning();
  if (!created) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
  }
  return created;
}

/**
 * Creates or updates an arrangement, creating the artist and the song when they are new
 * (matched case-insensitively). Blocking parse errors reject the save; warnings do not.
 */
export async function saveArrangement(
  db: Database,
  search: SearchIndex,
  params: { authorId: string; input: ArrangementInput; arrangementId?: string },
) {
  const { authorId, input, arrangementId } = params;
  const { doc, diagnostics } = parse(input.content);
  const errors = [...diagnostics, ...validate(doc, input.rhythms)].filter(
    (diagnostic) => diagnostic.severity === 'error',
  );
  if (errors.length > 0) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: errors.map((e) => `${e.line}:${e.col} ${e.message}`).join('\n'),
    });
  }

  const saved = await db.transaction(async (tx) => {
    const artistRow = await resolveArtist(tx, input.artist);
    const songRow = await resolveSong(tx, artistRow.id, input.song);
    const values = {
      songId: songRow.id,
      content: input.content,
      rhythms: input.rhythms,
      chords: chordList(doc),
      key: input.key || null,
      capo: input.capo,
      tempo: input.tempo,
      notes: input.notes,
    };

    let id = arrangementId;
    if (id) {
      const existing = await tx.query.arrangement.findFirst({ where: { id } });
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Arrangement not found' });
      }
      if (existing.authorId !== authorId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      await tx.update(arrangement).set(values).where(eq(arrangement.id, id));
    } else {
      const [created] = await tx
        .insert(arrangement)
        .values({ ...values, authorId })
        .returning({ id: arrangement.id });
      id = created?.id;
    }
    if (!id) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    }
    return { id, artistSlug: artistRow.slug, songSlug: songRow.slug };
  });

  await syncArrangement(db, search, saved.id);
  return saved;
}
