import { env } from '../env';
import { createArtistSources } from './artist-sources';

// Wikimedia asks every client to name itself and give a way to reach its operator.
export const artistSources = createArtistSources({
  userAgent: `ChordTune (${env.BETTER_AUTH_URL})`,
});
