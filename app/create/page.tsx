'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createGameClient } from '@/lib/game-client-factory';
import { useAuth } from '@/lib/useAuth';
import { isHostAllowed } from '@/lib/host-allowlist';

export default function CreatePage() {
  const router = useRouter();
  const { user, loading, isGoogleUser, signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    'checking' | 'login' | 'denied' | 'creating' | 'error'
  >('checking');
  const hasStartedRef = useRef(false);

  const userAllowed = isHostAllowed(user?.email);

  // Determine what to show
  useEffect(() => {
    if (loading) {
      setStatus('checking');
      return;
    }

    if (!isGoogleUser) {
      setStatus('login');
      return;
    }

    if (!userAllowed) {
      setStatus('denied');
      return;
    }

    // Ready to create - but only do it once
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    setStatus('creating');

    const client = createGameClient();

    client.on('roomJoined', (message: any) => {
      console.log('[CreatePage] Room joined:', message.roomId);
      router.push(`/host/${message.roomId}`);
    });

    client.on('error', (message: any) => {
      console.error('[CreatePage] Error:', message);
      setError(message.message || 'Failed to create game');
      setStatus('error');
    });

    client
      .connect()
      .then(() => {
        console.log('[CreatePage] Connected, joining room as host...');
        client.joinRoom(null, undefined, 'host');
      })
      .catch((err) => {
        console.error('[CreatePage] Connection failed:', err);
        setError('Failed to connect to server');
        setStatus('error');
      });

    // Don't disconnect on cleanup - let the navigation happen
  }, [loading, isGoogleUser, userAllowed, router]);

  // Login required
  if (status === 'login') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-b from-blue-900 to-blue-950">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <h1 className="text-3xl font-bold mb-4 text-gray-900">Host a Game</h1>
          <p className="text-gray-600 mb-6">
            Sign in with Google to create and host Jeopardy games.
          </p>
          <button
            onClick={signIn}
            className="w-full px-6 py-3 bg-white border-2 border-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center gap-3 shadow-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>
          <button
            onClick={() => router.push('/')}
            className="mt-4 text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Back to home
          </button>
        </div>
      </main>
    );
  }

  // Access denied
  if (status === 'denied') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-b from-red-900 to-red-950">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold mb-4 text-gray-900">
            Access Restricted
          </h1>
          <p className="text-gray-600 mb-2">
            Hosting is currently limited to approved accounts.
          </p>
          <p className="text-sm text-gray-400 mb-6">
            Signed in as {user?.email}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => router.push('/join')}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
            >
              Join a Game Instead
            </button>
            <button
              onClick={() => router.push('/')}
              className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300"
            >
              Back to Home
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Error
  if (status === 'error') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24">
        <h1 className="text-4xl font-bold mb-8">Create Game</h1>
        <div className="text-red-600 mb-4">{error}</div>
        <button
          onClick={() => router.push('/')}
          className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Back to Home
        </button>
      </main>
    );
  }

  // Loading / Creating
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Create Game</h1>
      <div className="flex items-center gap-3">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
        <span>{status === 'checking' ? 'Loading...' : 'Creating room...'}</span>
      </div>
      {user && status === 'creating' && (
        <div className="mt-4 text-sm text-gray-500">
          Hosting as {user.displayName || user.email}
        </div>
      )}
    </main>
  );
}
