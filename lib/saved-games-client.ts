import { getFirestoreDb, isFirebaseConfigured } from './firebase';
import type { GameConfig } from '@/shared/types';

export interface SavedGameSummary {
  id: string;
  createdAt: string;
  metadata?: { topics: string; difficulty: string };
  savedBy?: {
    uid: string;
    displayName: string | null;
    email: string | null;
  } | null;
}

function fs() {
  return require('firebase/firestore') as typeof import('firebase/firestore');
}

export async function listSavedGames(): Promise<SavedGameSummary[]> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }

  const db = getFirestoreDb();
  const gamesRef = fs().collection(db, 'savedGames');
  const q = fs().query(gamesRef, fs().orderBy('savedAt', 'desc'));
  const snapshot = await fs().getDocs(q);

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();
    return {
      id: data.id || docSnap.id,
      createdAt: data.createdAt,
      savedAt: data.savedAt?.toDate?.()?.toISOString() || data.savedAt,
      metadata: data.metadata,
      savedBy: data.savedBy || null,
    };
  });
}

export async function getSavedGame(gameId: string): Promise<GameConfig | null> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured');
  }

  const db = getFirestoreDb();
  const docRef = fs().doc(db, 'savedGames', gameId);
  const docSnap = await fs().getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { savedAt, ...gameConfig } = data as Record<string, unknown>;
  return gameConfig as unknown as GameConfig;
}
