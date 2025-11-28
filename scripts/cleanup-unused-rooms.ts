/**
 * Script to delete unused/abandoned game rooms from Firestore
 *
 * Criteria for deletion:
 * - Room created more than 1 hour ago
 * - No game config (game was never loaded/created)
 *
 * Usage:
 *   npm run cleanup-rooms
 *   npm run cleanup-rooms -- --dry-run   # Preview what would be deleted
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const isDryRun = process.argv.includes('--dry-run');

if (!projectId) {
  console.error('❌ Firebase project ID not found in .env.local');
  console.error('Required: NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  process.exit(1);
}

console.log(`🔥 Connecting to Firebase project: ${projectId}`);
console.log(
  `   Mode: ${isDryRun ? '🔍 DRY RUN (no deletions)' : '🗑️  LIVE (will delete)'}`,
);
console.log('');

// Initialize Firebase Admin with Application Default Credentials
initializeApp({
  credential: applicationDefault(),
  projectId: projectId,
});

const db = getFirestore();

// Room must be older than this to be considered for deletion
const MIN_AGE_MS = 20 * 60 * 1000; // 20 minutes

interface RoomInfo {
  roomId: string;
  createdAt: Date | null;
  hasConfig: boolean;
  hostId: string | null;
  ageMinutes: number;
}

async function getRoomInfo(roomId: string): Promise<RoomInfo | null> {
  try {
    const metadataSnap = await db
      .collection('games')
      .doc(roomId)
      .collection('metadata')
      .doc('info')
      .get();
    const configSnap = await db
      .collection('games')
      .doc(roomId)
      .collection('config')
      .doc('current')
      .get();

    if (!metadataSnap.exists) {
      return null;
    }

    const metadata = metadataSnap.data();
    const createdAt =
      metadata?.createdAt instanceof Timestamp
        ? metadata.createdAt.toDate()
        : null;

    const ageMs = createdAt ? Date.now() - createdAt.getTime() : 0;

    return {
      roomId,
      createdAt,
      hasConfig: configSnap.exists,
      hostId: metadata?.hostId || null,
      ageMinutes: Math.round(ageMs / 60000),
    };
  } catch (error) {
    console.error(`Error getting info for room ${roomId}:`, error);
    return null;
  }
}

async function deleteRoom(roomId: string): Promise<boolean> {
  try {
    const roomRef = db.collection('games').doc(roomId);

    // Delete all subcollections
    const subcollections = ['metadata', 'config', 'state', 'players', 'buzzes'];

    for (const subcol of subcollections) {
      const docs = await roomRef.collection(subcol).listDocuments();
      for (const doc of docs) {
        if (!isDryRun) {
          await doc.delete();
        }
      }
    }

    // Note: Firestore doesn't require deleting the parent document if it has no data
    // The room "document" is just a path container for subcollections

    return true;
  } catch (error) {
    console.error(`Error deleting room ${roomId}:`, error);
    return false;
  }
}

async function main() {
  console.log('📋 Scanning for unused rooms...\n');

  // Get all rooms by listing documents in the games collection's metadata subcollections
  const gamesRef = db.collection('games');
  const roomDocs = await gamesRef.listDocuments();

  console.log(`Found ${roomDocs.length} total rooms\n`);

  const roomsToDelete: RoomInfo[] = [];
  const roomsToKeep: RoomInfo[] = [];

  for (const roomDoc of roomDocs) {
    const roomId = roomDoc.id;
    const info = await getRoomInfo(roomId);

    if (!info) {
      console.log(`  ⚠️  ${roomId} - No metadata found (orphaned?)`);
      continue;
    }

    const isOldEnough = info.ageMinutes >= MIN_AGE_MS / 60000;
    const shouldDelete = isOldEnough && !info.hasConfig;

    if (shouldDelete) {
      roomsToDelete.push(info);
      console.log(`  🗑️  ${roomId} - ${info.ageMinutes}min old, no config`);
    } else {
      roomsToKeep.push(info);
      const reason = !isOldEnough
        ? `too recent (${info.ageMinutes}min)`
        : 'has config';
      console.log(`  ✅ ${roomId} - keeping (${reason})`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Summary:`);
  console.log(`   Total rooms: ${roomDocs.length}`);
  console.log(`   To delete: ${roomsToDelete.length}`);
  console.log(`   To keep: ${roomsToKeep.length}`);

  if (roomsToDelete.length === 0) {
    console.log('\n✨ No rooms to delete!');
    return;
  }

  if (isDryRun) {
    console.log('\n🔍 DRY RUN - No rooms were deleted.');
    console.log('   Run without --dry-run to actually delete.');
    return;
  }

  console.log('\n🗑️  Deleting rooms...\n');

  let deleted = 0;
  let failed = 0;

  for (const room of roomsToDelete) {
    const success = await deleteRoom(room.roomId);
    if (success) {
      console.log(`   ✅ Deleted ${room.roomId}`);
      deleted++;
    } else {
      console.log(`   ❌ Failed to delete ${room.roomId}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n🎉 Cleanup complete!`);
  console.log(`   Deleted: ${deleted}`);
  console.log(`   Failed: ${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
