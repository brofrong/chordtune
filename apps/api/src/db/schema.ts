import { account, authRelations, session, user, verification } from './auth-schema';

export * from './auth-schema';

export const tables = { user, session, account, verification };

// App relations (songs, arrangements, …) get defined with `defineRelations` and spread before
// the auth part, as `defineRelationsPart` entries must come last.
export const relations = { ...authRelations };
