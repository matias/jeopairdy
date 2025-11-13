'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export default function CreateGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams?.get('roomId');
  
  const [prompt, setPrompt] = useState('');
  const [difficulty, setDifficulty] = useState('moderate');
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocketClient | null>(null);

  if (!roomId) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div>No room ID provided</div>
      </main>
    );
  }

  const handleCreate = async () => {
    if (!prompt.trim()) {
      setError('Please provide a prompt or topics');
      return;
    }

    setLoading(true);
    setError(null);

    const client = new WebSocketClient(WS_URL);
    try {
      await client.connect();
      client.joinRoom(roomId, undefined, 'host');
      
      client.on('gameCreated', (message: any) => {
        setLoading(false);
        router.push(`/host/${roomId}`);
      });

      client.on('error', (message: any) => {
        setError(message.message);
        setLoading(false);
      });

      setWs(client);

      // Wait a bit for connection to establish
      setTimeout(() => {
        client.createGame(prompt, difficulty, sourceMaterial || undefined);
      }, 500);
    } catch (err) {
      setError('Failed to connect to server');
      setLoading(false);
      console.error(err);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Create Game</h1>
      
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <label htmlFor="prompt" className="block mb-2 font-bold">
            Topics / Prompt *
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., 1990s pop culture, World War II, Shakespeare, Science facts for kids..."
            className="w-full px-4 py-2 border rounded h-32"
            required
          />
          <p className="text-sm text-gray-600 mt-1">
            Describe the topics, themes, or subject matter for the questions
          </p>
        </div>

        <div>
          <label htmlFor="difficulty" className="block mb-2 font-bold">
            Difficulty Level
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="w-full px-4 py-2 border rounded"
          >
            <option value="easy">Easy (for kids or beginners)</option>
            <option value="moderate">Moderate (general audience)</option>
            <option value="hard">Hard (expert level)</option>
          </select>
        </div>

        <div>
          <label htmlFor="sourceMaterial" className="block mb-2 font-bold">
            Source Material (Optional)
          </label>
          <textarea
            id="sourceMaterial"
            value={sourceMaterial}
            onChange={(e) => setSourceMaterial(e.target.value)}
            placeholder="Paste text content here, or provide a file path to a .txt file"
            className="w-full px-4 py-2 border rounded h-32"
          />
          <p className="text-sm text-gray-600 mt-1">
            Provide text content or a path to a text file to base questions on
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleCreate}
            disabled={loading || !prompt.trim()}
            className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
          >
            {loading ? 'Generating...' : 'Generate Game'}
          </button>
          <button
            onClick={() => router.push(`/host/${roomId}`)}
            className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}

