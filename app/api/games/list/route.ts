import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Check if we're in Firebase mode
function isFirebaseMode(): boolean {
  return process.env.NEXT_PUBLIC_FIREBASE_MODE === 'true';
}

// List games from Firestore using the client SDK
async function listGamesFromFirestore() {
  // Dynamic import to avoid issues when Firebase isn't configured
  const { initializeApp, getApps } = await import('firebase/app');
  const { getFirestore, collection, query, orderBy, getDocs } = await import(
    'firebase/firestore'
  );

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
  const gamesRef = collection(db, 'savedGames');
  const q = query(gamesRef, orderBy('savedAt', 'desc'));
  const snapshot = await getDocs(q);

  const games = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: data.id || doc.id,
      createdAt: data.createdAt,
      savedAt: data.savedAt?.toDate?.()?.toISOString() || data.savedAt,
      metadata: data.metadata,
      savedBy: data.savedBy || null,
    };
  });

  return games;
}

// List games from local filesystem
async function listGamesFromFilesystem() {
  const testDataDir = path.join(process.cwd(), 'server/test-data');

  // Check if directory exists
  try {
    await fs.access(testDataDir);
  } catch {
    // Directory doesn't exist - return empty list
    return [];
  }

  const files = await fs.readdir(testDataDir);
  const jsonFiles = files.filter((f) => f.endsWith('.json'));

  const games = await Promise.all(
    jsonFiles.map(async (filename) => {
      const filePath = path.join(testDataDir, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      const game = JSON.parse(content);

      return {
        id: game.id,
        createdAt: game.createdAt,
        filename,
        metadata: game.metadata,
      };
    }),
  );

  // Sort by createdAt descending
  games.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return games;
}

export async function GET() {
  try {
    const games = isFirebaseMode()
      ? await listGamesFromFirestore()
      : await listGamesFromFilesystem();

    return NextResponse.json(games);
  } catch (error) {
    console.error('Error listing games:', error);
    return NextResponse.json(
      { error: 'Failed to list games' },
      { status: 500 },
    );
  }
}
