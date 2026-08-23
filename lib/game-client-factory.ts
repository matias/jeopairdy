import type { IGameClient } from './game-client-interface';

/**
 * Creates a FirestoreClient for game communication.
 * All games now use Firebase/Firestore for real-time sync.
 *
 * FirestoreClient is required lazily so Firebase is not loaded during Worker SSR.
 */
export function createGameClient(): IGameClient {
  const { FirestoreClient } =
    require('./firestore-client') as typeof import('./firestore-client');
  return new FirestoreClient();
}

/**
 * Get the current mode as a string (for debugging/display)
 * Always returns 'firebase' since WebSocket mode has been removed.
 */
export function getGameMode(): 'firebase' {
  return 'firebase';
}
