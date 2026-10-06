import { authConfig, authMethods } from '../../auth/config';
import { env } from '../../env';
import { publicProcedure, router } from '../init';

const methods = authMethods(authConfig(env));

/** The static mobile build cannot read server env, so it asks which sign-in buttons to show. */
export const authRouter = router({
  methods: publicProcedure.query(() => methods),
});
