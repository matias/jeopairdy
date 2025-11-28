import { IGameClient } from './game-client-interface';
import { WebSocketClient } from './websocket';
import { FirestoreClient } from './firestore-client';
import { getWebSocketUrl } from './websocket-url';
import { isFirebaseConfigured } from './firebase';

/**
 * Determines whether to use Firebase mode based on environment and runtime context.
 */
export function shouldUseFirebaseMode(): boolean {
  const envMode = process.env.NEXT_PUBLIC_FIREBASE_MODE;

  // 1. Explicit environment variable override
  if (envMode === 'true') {
    console.log(
      '[GameClient] Firebase mode enabled via NEXT_PUBLIC_FIREBASE_MODE=true',
    );
    return true;
  }
  if (envMode === 'false') {
    console.log(
      '[GameClient] WebSocket mode enabled via NEXT_PUBLIC_FIREBASE_MODE=false',
    );
    return false;
  }

  // 2. Check if running on Firebase Hosting or similar cloud environment
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // Firebase Hosting domains
    if (
      hostname.includes('firebaseapp.com') ||
      hostname.includes('web.app') ||
      hostname.includes('firebaseio.com')
    ) {
      console.log(
        '[GameClient] Firebase mode enabled (Firebase Hosting domain)',
      );
      return true;
    }

    // Vercel deployment (if Firebase is configured)
    if (hostname.includes('vercel.app') && isFirebaseConfigured()) {
      console.log(
        '[GameClient] Firebase mode enabled (Vercel + Firebase configured)',
      );
      return true;
    }

    // Any non-localhost domain with Firebase configured
    if (
      !hostname.includes('localhost') &&
      !hostname.match(/^192\.168\./) &&
      !hostname.match(/^10\./) &&
      !hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) &&
      isFirebaseConfigured()
    ) {
      console.log(
        '[GameClient] Firebase mode enabled (cloud deployment + Firebase configured)',
      );
      return true;
    }
  }

  // 3. Default to WebSocket (local mode)
  console.log(
    '[GameClient] WebSocket mode (default - NEXT_PUBLIC_FIREBASE_MODE not set or running locally)',
  );
  return false;
}

/**
 * Creates the appropriate game client based on the current environment.
 *
 * - In local mode: Creates a WebSocketClient that connects to the local server
 * - In Firebase mode: Creates a FirestoreClient that uses Firestore for real-time sync
 *
 * @param autoReconnect - Whether to enable auto-reconnect (WebSocket mode only)
 * @returns An IGameClient instance
 */
export function createGameClient(autoReconnect: boolean = true): IGameClient {
  const useFirebase = shouldUseFirebaseMode();

  if (useFirebase) {
    console.log('Using Firebase/Firestore mode');
    return new FirestoreClient();
  } else {
    console.log('Using WebSocket mode');
    return new WebSocketClient(getWebSocketUrl(), autoReconnect);
  }
}

/**
 * Get the current mode as a string (for debugging/display)
 */
export function getGameMode(): 'firebase' | 'websocket' {
  return shouldUseFirebaseMode() ? 'firebase' : 'websocket';
}
