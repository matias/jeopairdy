import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  Auth,
  User,
} from 'firebase/auth';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy initialization to support SSR
let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

/**
 * Check if Firebase is configured (environment variables are set)
 */
export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId
  );
}

/**
 * Get or initialize the Firebase app
 */
export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    if (!isFirebaseConfigured()) {
      throw new Error(
        'Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* environment variables.',
      );
    }
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  return app;
}

/**
 * Get or initialize Firestore
 */
export function getFirestoreDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
  }
  return db;
}

/**
 * Get or initialize Firebase Auth
 */
export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

/**
 * Ensure the user is authenticated (anonymously).
 * Returns the user's UID which is used for Firestore security rules.
 */
export async function ensureAuth(): Promise<string> {
  return new Promise((resolve, reject) => {
    const authInstance = getFirebaseAuth();

    const unsubscribe = onAuthStateChanged(
      authInstance,
      async (user: User | null) => {
        unsubscribe();
        if (user) {
          resolve(user.uid);
        } else {
          try {
            const cred = await signInAnonymously(authInstance);
            resolve(cred.user.uid);
          } catch (e) {
            reject(e);
          }
        }
      },
    );
  });
}

/**
 * Get current user UID if authenticated, null otherwise
 */
export function getCurrentUserId(): string | null {
  const authInstance = getFirebaseAuth();
  return authInstance.currentUser?.uid || null;
}

/**
 * Get current user info
 */
export function getCurrentUser(): User | null {
  const authInstance = getFirebaseAuth();
  return authInstance.currentUser;
}

/**
 * Sign in with Google
 */
export async function signInWithGoogle(): Promise<User> {
  const authInstance = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(authInstance, provider);
  return result.user;
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  const authInstance = getFirebaseAuth();
  await firebaseSignOut(authInstance);
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(
  callback: (user: User | null) => void,
): () => void {
  const authInstance = getFirebaseAuth();
  return onAuthStateChanged(authInstance, callback);
}

/**
 * Check if user is signed in with Google (not anonymous)
 */
export function isGoogleUser(): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === 'google.com');
}
