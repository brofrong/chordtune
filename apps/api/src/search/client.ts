import { env } from '../env';
import { createMeiliSearch } from '.';

export const search = createMeiliSearch(env.MEILI_URL, env.MEILI_KEY);
