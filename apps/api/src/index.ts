import { app } from './app';
import { env } from './env';

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
