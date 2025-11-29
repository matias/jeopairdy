import { IGameClient } from './game-client-interface';
import { FirestoreClient } from './firestore-client';

/**
 * Creates a FirestoreClient for game communication.
 * All games now use Firebase/Firestore for real-time sync.
 *
 * @returns An IGameClient instance (FirestoreClient)
 */
export function createGameClient(): IGameClient {
  return new FirestoreClient();
}

/**
 * Get the current mode as a string (for debugging/display)
 * Always returns 'firebase' since WebSocket mode has been removed.
 */
export function getGameMode(): 'firebase' {
  return 'firebase';
}
