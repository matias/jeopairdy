'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createGameClient } from '@/lib/game-client-factory';
import { IGameClient } from '@/lib/game-client-interface';
import { GameConfig } from '@/shared/types';
import { AuthHeader } from '@/components/AuthHeader';

interface SavedGame {
  id: string;
  createdAt: string;
  filename?: string;
  metadata?: { topics: string; difficulty: string };
  savedBy?: {
    uid: string;
    displayName: string | null;
    email: string | null;
  } | null;
}

function LoadGamePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams?.get('roomId');

  const [games, setGames] = useState<SavedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameClient, setGameClient] = useState<IGameClient | null>(null);
  const [previewGame, setPreviewGame] = useState<GameConfig | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async () => {
    try {
      const response = await fetch('/api/games/list');
      if (response.ok) {
        const data = await response.json();
        setGames(data);
      }
    } catch (error) {
      console.error('Error fetching games:', error);
      setError('Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewGame = async (gameId: string) => {
    setPreviewLoading(true);
    try {
      const response = await fetch(`/api/games/${gameId}`);
      if (!response.ok) throw new Error('Failed to load game preview');
      const gameConfig = await response.json();
      setPreviewGame(gameConfig);
    } catch (error) {
      console.error('Error loading preview:', error);
      // Optionally show a toast or alert
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleLoadGame = async (gameId: string) => {
    if (!roomId) {
      setError('No room ID provided');
      return;
    }

    try {
      const response = await fetch(`/api/games/${gameId}`);
      if (!response.ok) {
        throw new Error('Failed to load game');
      }

      const gameConfig: GameConfig = await response.json();

      const client = createGameClient();
      await client.connect();
      client.joinRoom(roomId, undefined, 'host');

      client.on('gameStateUpdate', (message: any) => {
        router.push(`/host/${roomId}`);
      });

      client.on('error', (message: any) => {
        setError(message.message);
      });

      setGameClient(client);

      // Wait a bit for connection to establish, then send game config
      setTimeout(() => {
        client.loadGame(gameConfig);
      }, 500);
    } catch (error) {
      setError('Failed to load game');
      console.error(error);
    }
  };

  if (!roomId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-blue-900">
        <div className="text-white">No room ID provided</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 lg:p-24 bg-blue-900">
      <AuthHeader />
      <h1 className="jeopardy-title text-4xl font-bold mb-8 text-white uppercase tracking-wider">
        Load Game
      </h1>

      {loading ? (
        <div className="text-white">Loading games...</div>
      ) : error ? (
        <div className="text-red-500">{error}</div>
      ) : (
        <div className="w-full max-w-4xl">
          {games.length === 0 ? (
            <div className="text-center">
              <p className="mb-4 text-white">No saved games found.</p>
              <button
                onClick={() => router.push(`/create-game?roomId=${roomId}`)}
                className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              >
                Create New Game
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="bg-blue-800 p-6 rounded-lg shadow-sm border border-blue-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="font-bold text-lg text-white">
                        {game.id}
                      </div>
                      <span className="text-xs px-2 py-1 bg-blue-900 rounded-full text-gray-300">
                        {new Date(game.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {game.metadata && (
                      <div className="text-sm text-gray-300 space-y-1">
                        <p>
                          <span className="font-medium">Topics:</span>{' '}
                          {game.metadata.topics}
                        </p>
                        <p>
                          <span className="font-medium">Difficulty:</span>{' '}
                          {game.metadata.difficulty}
                        </p>
                      </div>
                    )}
                    {game.savedBy && (
                      <div className="text-xs text-gray-400 mt-2">
                        Saved by{' '}
                        {game.savedBy.displayName ||
                          game.savedBy.email ||
                          'Anonymous'}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handlePreviewGame(game.id)}
                      className="px-4 py-2 text-white border border-blue-600 rounded hover:bg-blue-700 transition-colors"
                      disabled={previewLoading}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => handleLoadGame(game.id)}
                      className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 shadow-sm transition-colors"
                    >
                      Load
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 flex gap-4 justify-center">
            <button
              onClick={() => router.push(`/host/${roomId}`)}
              className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => router.push(`/create-game?roomId=${roomId}`)}
              className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              Create New Game
            </button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewGame && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-blue-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-blue-700">
            <div className="p-6 border-b border-blue-700 flex justify-between items-start bg-blue-900">
              <div>
                <h2 className="text-2xl font-bold text-white">Game Preview</h2>
                <p className="text-sm text-gray-300 mt-1">
                  {previewGame.id} • Created{' '}
                  {new Date(previewGame.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setPreviewGame(null)}
                className="text-gray-300 hover:text-white p-1 transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-8">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-blue-900 p-4 rounded-lg border border-blue-700">
                  <h3 className="font-semibold text-white mb-2">Config</h3>
                  <div className="space-y-2 text-sm text-gray-300">
                    <p>
                      <span className="font-medium">Topics:</span>{' '}
                      {previewGame.metadata?.topics || 'N/A'}
                    </p>
                    <p>
                      <span className="font-medium">Difficulty:</span>{' '}
                      {previewGame.metadata?.difficulty || 'N/A'}
                    </p>
                  </div>
                </div>
                <div className="bg-blue-900 p-4 rounded-lg border border-blue-700">
                  <h3 className="font-semibold text-white mb-2">Stats</h3>
                  <div className="space-y-2 text-sm text-gray-300">
                    <p>
                      <span className="font-medium">Jeopardy:</span>{' '}
                      {previewGame.jeopardy.categories.length} categories
                    </p>
                    <p>
                      <span className="font-medium">Double Jeopardy:</span>{' '}
                      {previewGame.doubleJeopardy.categories.length} categories
                    </p>
                    <p>
                      <span className="font-medium">Final Jeopardy:</span>{' '}
                      {previewGame.finalJeopardy.category ? 'Ready' : 'Missing'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-white mb-4 text-lg border-b border-blue-700 pb-2">
                  Jeopardy Round
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {previewGame.jeopardy.categories.slice(0, 6).map((cat) => (
                    <div
                      key={cat.id}
                      className="border border-blue-700 rounded-lg p-4 bg-blue-900"
                    >
                      <h4 className="font-bold text-center mb-3 text-white uppercase text-sm tracking-wide h-10 flex items-center justify-center">
                        {cat.name}
                      </h4>
                      <div className="space-y-2">
                        {cat.clues.slice(0, 3).map((clue) => (
                          <div
                            key={clue.id}
                            className="text-xs p-2 bg-blue-800 rounded border border-blue-600"
                          >
                            <span className="font-bold text-yellow-400 block mb-1">
                              ${clue.value}
                            </span>
                            <span className="line-clamp-2 text-gray-300">
                              {clue.clue}
                            </span>
                          </div>
                        ))}
                        {cat.clues.length > 3 && (
                          <div className="text-xs text-center text-gray-400 italic pt-1">
                            + {cat.clues.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-blue-700 bg-blue-900 flex justify-end gap-3">
              <button
                onClick={() => setPreviewGame(null)}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (previewGame) handleLoadGame(previewGame.id);
                }}
                className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 shadow-sm transition-colors"
              >
                Load This Game
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function LoadGamePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-8 lg:p-24 bg-blue-900">
          <h1 className="jeopardy-title text-4xl font-bold mb-8 text-white uppercase tracking-wider">
            Load Game
          </h1>
          <div className="text-white">Loading...</div>
        </main>
      }
    >
      <LoadGamePageContent />
    </Suspense>
  );
}
