'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createGameClient } from '@/lib/game-client-factory';
import { IGameClient } from '@/lib/game-client-interface';
import { GameConfig } from '@/shared/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function LoadGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams?.get('roomId');

  const [games, setGames] = useState<
    Array<{
      id: string;
      createdAt: string;
      filename: string;
      metadata?: { topics: string; difficulty: string };
    }>
  >([]);
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
      const response = await fetch(`${API_URL}/api/games/list`);
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
      const response = await fetch(`${API_URL}/api/games/${gameId}`);
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
      const response = await fetch(`${API_URL}/api/games/${gameId}`);
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
      <main className="flex min-h-screen items-center justify-center">
        <div>No room ID provided</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 lg:p-24">
      <h1 className="text-4xl font-bold mb-8">Load Game</h1>

      {loading ? (
        <div>Loading games...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="w-full max-w-4xl">
          {games.length === 0 ? (
            <div className="text-center">
              <p className="mb-4">No saved games found.</p>
              <button
                onClick={() => router.push(`/create-game?roomId=${roomId}`)}
                className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create New Game
              </button>
            </div>
          ) : (
            <div className="grid gap-4">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <div className="font-bold text-lg">{game.id}</div>
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded-full text-gray-600">
                        {new Date(game.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    {game.metadata && (
                      <div className="text-sm text-gray-600 space-y-1">
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
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handlePreviewGame(game.id)}
                      className="px-4 py-2 text-blue-600 border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                      disabled={previewLoading}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => handleLoadGame(game.id)}
                      className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow-sm transition-colors"
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
              className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Back
            </button>
            <button
              onClick={() => router.push(`/create-game?roomId=${roomId}`)}
              className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create New Game
            </button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewGame && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Game Preview
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {previewGame.id} • Created{' '}
                  {new Date(previewGame.createdAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setPreviewGame(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
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
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <h3 className="font-semibold text-blue-900 mb-2">Config</h3>
                  <div className="space-y-2 text-sm text-blue-800">
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
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                  <h3 className="font-semibold text-purple-900 mb-2">Stats</h3>
                  <div className="space-y-2 text-sm text-purple-800">
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
                <h3 className="font-bold text-gray-900 mb-4 text-lg border-b pb-2">
                  Jeopardy Round
                </h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {previewGame.jeopardy.categories.slice(0, 6).map((cat) => (
                    <div
                      key={cat.id}
                      className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                    >
                      <h4 className="font-bold text-center mb-3 text-blue-800 uppercase text-sm tracking-wide h-10 flex items-center justify-center">
                        {cat.name}
                      </h4>
                      <div className="space-y-2">
                        {cat.clues.slice(0, 3).map((clue) => (
                          <div
                            key={clue.id}
                            className="text-xs p-2 bg-white rounded border border-gray-100"
                          >
                            <span className="font-bold text-blue-600 block mb-1">
                              ${clue.value}
                            </span>
                            <span className="line-clamp-2 text-gray-600">
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

            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setPreviewGame(null)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (previewGame) handleLoadGame(previewGame.id);
                }}
                className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow-sm"
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
