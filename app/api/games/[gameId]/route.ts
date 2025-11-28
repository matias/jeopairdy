import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Check if we're in Firebase mode
function isFirebaseMode(): boolean {
  return process.env.NEXT_PUBLIC_FIREBASE_MODE === 'true';
}

// Get game from Firestore using the client SDK
async function getGameFromFirestore(gameId: string) {
  // Dynamic import to avoid issues when Firebase isn't configured
  const { initializeApp, getApps } = await import('firebase/app');
  const { getFirestore, doc, getDoc } = await import('firebase/firestore');

  // Initialize Firebase if not already done
  if (getApps().length === 0) {
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    if (!firebaseConfig.projectId) {
      throw new Error('Firebase project ID not configured');
    }

    initializeApp(firebaseConfig);
  }

  const db = getFirestore();
  const docRef = doc(db, 'savedGames', gameId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  const data = docSnap.data();
  // Remove Firestore-specific fields
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { savedAt, ...gameConfig } = data as Record<string, unknown>;
  return gameConfig;
}

// Get game from local filesystem
async function getGameFromFilesystem(gameId: string) {
  const testDataDir = path.join(process.cwd(), 'server/test-data');

  // Try to find the game file
  // First try exact match with .json extension
  let filePath = path.join(testDataDir, `${gameId}.json`);

  try {
    await fs.access(filePath);
  } catch {
    // Try finding by game ID prefix (e.g., game-1234567890.json)
    try {
      const files = await fs.readdir(testDataDir);
      const matchingFile = files.find(
        (f) => f.startsWith(gameId) || f.includes(gameId),
      );

      if (!matchingFile) {
        return null;
      }

      filePath = path.join(testDataDir, matchingFile);
    } catch {
      return null;
    }
  }

  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;

    const game = isFirebaseMode()
      ? await getGameFromFirestore(gameId)
      : await getGameFromFilesystem(gameId);

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 });
    }

    return NextResponse.json(game);
  } catch (error) {
    console.error('Error loading game:', error);
    return NextResponse.json({ error: 'Failed to load game' }, { status: 500 });
  }
}
