'use client';

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  onAuthChange,
  signInWithGoogle,
  signOut,
  isFirebaseConfigured,
} from './firebase';

export interface AuthState {
  user: User | null;
  loading: boolean;
  isSignedIn: boolean;
  isGoogleUser: boolean;
}

export function useAuth(): AuthState & {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthChange((user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Sign in failed:', error);
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
      throw error;
    }
  };

  const isGoogleUser =
    user?.providerData.some((p) => p.providerId === 'google.com') ?? false;

  return {
    user,
    loading,
    isSignedIn: !!user,
    isGoogleUser,
    signIn: handleSignIn,
    signOut: handleSignOut,
  };
}
