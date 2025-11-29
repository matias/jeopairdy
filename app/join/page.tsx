'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createGameClient } from '@/lib/game-client-factory';
import { IGameClient } from '@/lib/game-client-interface';

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [gameClient, setGameClient] = useState<IGameClient | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const room = searchParams?.get('room');
    if (room) {
      setRoomId(room);
    }
  }, [searchParams]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId && playerName) {
      const upperRoomId = roomId.toUpperCase();

      // Check if already joined this room
      const existingPlayer = localStorage.getItem(`player_${upperRoomId}`);
      if (existingPlayer) {
        // Already joined, redirect to player page
        router.push(`/player/${upperRoomId}`);
        return;
      }

      const client = createGameClient();
      client
        .connect()
        .then(() => {
          client.joinRoom(upperRoomId, playerName, 'player');
          client.on('roomJoined', (message: any) => {
            // Store player info in localStorage
            localStorage.setItem(
              `player_${upperRoomId}`,
              JSON.stringify({
                playerId: message.playerId,
                playerName: playerName,
                roomId: upperRoomId,
              }),
            );

            client.setPlayerId(message.playerId);
            router.push(`/player/${upperRoomId}`);
          });
          client.on('error', (message: any) => {
            setError(message.message);
          });
          setGameClient(client);
        })
        .catch((err) => {
          setError('Failed to connect to server');
          console.error(err);
        });
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-top p-24 bg-blue-900">
      <h1 className="jeopardy-title text-7xl font-bold mb-8 uppercase tracking-wider text-white">
        JEOP<span className="text-red-500">AI</span>RDY!
      </h1>
      <h2 className="text-4xl font-bold mb-8 text-white">Join Game</h2>

      <form onSubmit={handleJoin} className="flex flex-col gap-4 w-80">
        <div>
          <label htmlFor="roomId" className="block mb-2 text-white">
            Room Code
          </label>
          <input
            id="roomId"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            className="w-full px-4 py-2 border border-gray-600 rounded bg-blue-800 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
            placeholder="ABCD"
            maxLength={4}
            required
          />
        </div>

        <div>
          <label htmlFor="playerName" className="block mb-2 text-white">
            Your Name
          </label>
          <input
            id="playerName"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-600 rounded bg-blue-800 text-white placeholder-gray-400 focus:outline-none focus:border-yellow-400"
            placeholder="Enter your name"
            required
          />
        </div>

        {error && <div className="text-red-500 text-sm">{error}</div>}

        <button
          type="submit"
          className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Join
        </button>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          Back
        </button>
      </form>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-blue-900">
          <h1 className="text-4xl font-bold mb-8 text-white">Join Game</h1>
          <div className="text-white">Loading...</div>
        </main>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
}
