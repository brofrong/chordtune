import { db } from '../db';
import { search } from '../search/client';
import { reindexAll } from '../search/documents';

const counts = await reindexAll(db, search);
console.log(`Indexed ${counts.artists} artists and ${counts.arrangements} arrangements`);
process.exit(0);
