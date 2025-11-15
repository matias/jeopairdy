'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';

import { getWebSocketUrl } from '@/lib/websocket-url';

const WS_URL = getWebSocketUrl();

export default function CreatePage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocketClient | null>(null);

  useEffect(() => {
    const client = new WebSocketClient(WS_URL);
    client.connect().then(() => {
      client.joinRoom(null, undefined, 'host');
      client.on('roomJoined', (message: any) => {
        setRoomId(message.roomId);
        client.setPlayerId(message.playerId);
        // Redirect to host page immediately
        router.push(`/host/${message.roomId}`);
      });
      setWs(client);
    }).catch(console.error);

    return () => {
      client.disconnect();
    };
  }, [router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Create Game</h1>
      <div>Creating room...</div>
    </main>
  );
}

