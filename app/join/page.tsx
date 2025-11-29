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
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Join Game</h1>

      <form onSubmit={handleJoin} className="flex flex-col gap-4 w-80">
        <div>
          <label htmlFor="roomId" className="block mb-2">
            Room Code
          </label>
          <input
            id="roomId"
            type="text"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            className="w-full px-4 py-2 border rounded"
            placeholder="ABCD"
            maxLength={4}
            required
          />
        </div>

        <div>
          <label htmlFor="playerName" className="block mb-2">
            Your Name
          </label>
          <input
            id="playerName"
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full px-4 py-2 border rounded"
            placeholder="Enter your name"
            required
          />
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <button
          type="submit"
          className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Join
        </button>

        <button
          type="button"
          onClick={() => router.push('/')}
          className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700"
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
        <main className="flex min-h-screen flex-col items-center justify-center p-24">
          <h1 className="text-4xl font-bold mb-8">Join Game</h1>
          <div>Loading...</div>
        </main>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
}
