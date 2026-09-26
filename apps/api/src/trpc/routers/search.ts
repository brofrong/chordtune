import { z } from 'zod';

import { publicProcedure, router } from '../init';
import { fromSearch, listItemFromDoc } from './shared';

export const searchRouter = router({
  query: publicProcedure
    .input(z.object({ q: z.string().max(200) }))
    .query(async ({ ctx, input }) => {
      const hits = await fromSearch(() => ctx.search.search(input.q));
      return hits.map(listItemFromDoc);
    }),
});
