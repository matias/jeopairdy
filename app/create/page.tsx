'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { WebSocketClient } from '@/lib/websocket';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export default function CreatePage() {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocketClient | null>(null);

  useEffect(() => {
    const client = new WebSocketClient(WS_URL);
    client.connect().then(() => {
      client.joinRoom(null, undefined, 'host');
      client.on('roomJoined', (message: any) => {
        setRoomId(message.roomId);
        client.setPlayerId(message.playerId);
        
        // Generate QR code
        const joinUrl = `${window.location.origin}/join?room=${message.roomId}`;
        QRCode.toDataURL(joinUrl).then(url => {
          setQrCodeUrl(url);
        });
      });
      setWs(client);
    }).catch(console.error);

    return () => {
      client.disconnect();
    };
  }, []);

  const handleStart = () => {
    if (roomId) {
      router.push(`/host/${roomId}`);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold mb-8">Create Game</h1>
      
      {roomId ? (
        <div className="flex flex-col items-center gap-6">
          <div className="text-2xl">
            Room Code: <span className="font-bold text-blue-600">{roomId}</span>
          </div>
          
          {qrCodeUrl && (
            <div className="flex flex-col items-center gap-2">
              <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64" />
              <p className="text-sm text-gray-600">Scan to join</p>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={handleStart}
              className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Start Game
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div>Creating room...</div>
      )}
    </main>
  );
}

