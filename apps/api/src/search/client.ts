import { createMeiliSearch } from ".";
import { env } from "../env";

export const search = createMeiliSearch(env.MEILI_URL, env.MEILI_KEY);
