import type { Rhythm } from '@chordtune/chord-sheet';
import { defineRelations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { account, authRelations, session, user, verification } from './auth-schema';

export * from './auth-schema';

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const artist = pgTable(
  'artist',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('artist_name_lower_idx').on(sql`lower(${table.name})`)],
);

export const song = pgTable(
  'song',
  {
    id: id(),
    artistId: text('artist_id')
      .notNull()
      .references(() => artist.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [unique('song_artist_slug_unique').on(table.artistId, table.slug)],
);

export const ARRANGEMENT_STATUSES = ['draft', 'published'] as const;

/** One user's chords for a song; a song can have several. */
export const arrangement = pgTable(
  'arrangement',
  {
    id: id(),
    songId: text('song_id')
      .notNull()
      .references(() => song.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Song source in the `${Chord}` format of `@chordtune/chord-sheet`. */
    content: text('content').notNull(),
    rhythms: jsonb('rhythms').$type<Rhythm[]>().notNull().default([]),
    /** Unique chords from `chordList`, for «songs with only these chords» filters. */
    chords: text('chords').array().notNull().default([]),
    key: text('key'),
    capo: integer('capo'),
    tempo: integer('tempo'),
    notes: text('notes').notNull().default(''),
    status: text('status', { enum: ARRANGEMENT_STATUSES }).notNull().default('published'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('arrangement_song_idx').on(table.songId),
    index('arrangement_author_idx').on(table.authorId),
    index('arrangement_chords_idx').using('gin', table.chords),
  ],
);

/** Auth tables for the Better Auth adapter. */
export const tables = { user, session, account, verification };

const appRelations = defineRelations({ user, artist, song, arrangement }, (r) => ({
  artist: {
    songs: r.many.song({ from: r.artist.id, to: r.song.artistId }),
  },
  song: {
    artist: r.one.artist({ from: r.song.artistId, to: r.artist.id, optional: false }),
    arrangements: r.many.arrangement({ from: r.song.id, to: r.arrangement.songId }),
  },
  arrangement: {
    song: r.one.song({ from: r.arrangement.songId, to: r.song.id, optional: false }),
    author: r.one.user({ from: r.arrangement.authorId, to: r.user.id, optional: false }),
  },
}));

// `defineRelationsPart` entries must come last.
export const relations = { ...appRelations, ...authRelations };
