/**
 * Script to import existing games from server/test-data into Firestore
 *
 * Usage:
 *   npm run import-games
 *
 * This uses Firebase Admin SDK which bypasses security rules.
 * You need to be logged into Firebase CLI: `firebase login`
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!projectId) {
  console.error('❌ Firebase project ID not found in .env.local');
  console.error('Required: NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  process.exit(1);
}

console.log(`🔥 Connecting to Firebase project: ${projectId}`);
console.log(
  '   Using Application Default Credentials (from Firebase CLI login)\n',
);

// Initialize Firebase Admin with Application Default Credentials
// This uses the credentials from `firebase login`
initializeApp({
  credential: applicationDefault(),
  projectId: projectId,
});

const db = getFirestore();

async function importGames() {
  const testDataDir = path.join(process.cwd(), 'server/test-data');

  // Check if directory exists
  if (!fs.existsSync(testDataDir)) {
    console.error(`❌ Directory not found: ${testDataDir}`);
    process.exit(1);
  }

  // Get all JSON files
  const files = fs.readdirSync(testDataDir).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.log('No JSON files found in test-data directory.');
    return;
  }

  console.log(`📁 Found ${files.length} game files to import:\n`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const filename of files) {
    const filePath = path.join(testDataDir, filename);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const game = JSON.parse(content);

      // Use the game's ID or derive from filename
      const gameId = game.id || filename.replace('.json', '');

      console.log(`  📄 ${filename}`);
      console.log(`     ID: ${gameId}`);
      console.log(`     Topics: ${game.metadata?.topics || 'N/A'}`);
      console.log(`     Created: ${game.createdAt || 'Unknown'}`);

      // Upload to Firestore using Admin SDK
      await db
        .collection('savedGames')
        .doc(gameId)
        .set({
          ...game,
          // Ensure the ID is set
          id: gameId,
          // Add import metadata
          savedAt: FieldValue.serverTimestamp(),
          savedBy: null, // Legacy import - no user attribution
          importedFrom: filename,
          importedAt: new Date().toISOString(),
        });

      console.log(`     ✅ Imported successfully\n`);
      imported++;
    } catch (err) {
      console.error(`     ❌ Error importing ${filename}:`, err);
      errors++;
    }
  }

  console.log('\n📊 Import Summary:');
  console.log(`   ✅ Imported: ${imported}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   📁 Total: ${files.length}`);
}

// Run the import
importGames()
  .then(() => {
    console.log('\n🎉 Import complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Import failed:', err);
    process.exit(1);
  });
