'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';
import { GameConfig } from '@/shared/types';

import { getWebSocketUrl } from '@/lib/websocket-url';

const WS_URL = getWebSocketUrl();
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function LoadGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams?.get('roomId');
  
  const [games, setGames] = useState<Array<{ id: string; createdAt: string; filename: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocketClient | null>(null);

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

      const client = new WebSocketClient(WS_URL);
      await client.connect();
      client.joinRoom(roomId, undefined, 'host');
      
      client.on('gameStateUpdate', (message: any) => {
        router.push(`/host/${roomId}`);
      });

      client.on('error', (message: any) => {
        setError(message.message);
      });

      setWs(client);

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
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Load Game</h1>
      
      {loading ? (
        <div>Loading games...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <div className="w-full max-w-2xl">
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
            <div className="space-y-4">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="bg-white p-4 rounded-lg shadow flex justify-between items-center"
                >
                  <div>
                    <div className="font-bold">{game.id}</div>
                    <div className="text-sm text-gray-600">
                      {new Date(game.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleLoadGame(game.id)}
                    className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Load
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex gap-4 justify-center">
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
    </main>
  );
}

