'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { WebSocketClient } from '@/lib/websocket';
import { GameState, ServerMessage } from '@/shared/types';
import GameBoard from '@/components/GameBoard/GameBoard';
import ClueDisplay from '@/components/ClueDisplay/ClueDisplay';
import Scoreboard from '@/components/Scoreboard/Scoreboard';

import { getWebSocketUrl } from '@/lib/websocket-url';

const WS_URL = getWebSocketUrl();

export default function GameDisplayPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [ws, setWs] = useState<WebSocketClient | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showScores, setShowScores] = useState(true);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    const client = new WebSocketClient(WS_URL);
    client.connect().then(() => {
      client.joinRoom(roomId, undefined, 'viewer'); // Join as viewer to receive updates without being added as a player
      
      client.on('roomJoined', (message: any) => {
        setGameState(message.gameState);
        // Generate QR code if game is ready
        if (message.gameState.status === 'ready' && typeof window !== 'undefined') {
          const joinUrl = `${window.location.origin}/join?room=${roomId}`;
          QRCode.toDataURL(joinUrl).then(url => {
            setQrCodeUrl(url);
          });
        }
      });

      client.on('gameStateUpdate', (message: any) => {
        setGameState(message.gameState);
        // Update QR code if status changes to ready
        if (message.gameState.status === 'ready' && typeof window !== 'undefined') {
          const joinUrl = `${window.location.origin}/join?room=${roomId}`;
          QRCode.toDataURL(joinUrl).then(url => {
            setQrCodeUrl(url);
          });
        }
      });

      setWs(client);
    }).catch(console.error);

    return () => {
      client.disconnect();
    };
  }, [roomId]);

  if (!gameState) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-blue-900">
        <div className="text-white text-2xl">Connecting...</div>
      </main>
    );
  }

  if (gameState.status === 'ready') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-blue-900">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="jeopardy-title text-6xl font-bold mb-8 uppercase tracking-wider text-white">JEOPARDY!</h1>
          <div className="bg-blue-800 p-8 rounded-lg">
            <h2 className="text-4xl font-bold mb-6 text-white">Join the Game</h2>
            {qrCodeUrl ? (
              <div className="flex flex-col items-center gap-4">
                <img src={qrCodeUrl} alt="QR Code" className="w-96 h-96 bg-white p-4 rounded" />
                <p className="text-xl text-white">Scan to join Room {roomId}</p>
                {typeof window !== 'undefined' && (
                  <p className="text-lg text-blue-200">Or visit: {window.location.origin}/join?room={roomId}</p>
                )}
              </div>
            ) : (
              <div className="text-white">Generating QR code...</div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-blue-900">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="jeopardy-title text-6xl font-bold mb-2 uppercase tracking-wider">JEOPARDY!</h1>
          <div className="text-3xl text-white font-bold uppercase tracking-wide">
            {gameState.currentRound === 'jeopardy' ? 'JEOPARDY ROUND' : 
             gameState.currentRound === 'doubleJeopardy' ? 'DOUBLE JEOPARDY ROUND' : 
             'FINAL JEOPARDY'}
          </div>
        </div>

        {showScores && gameState.status === 'selecting' && (
          <div className="mb-6">
            <Scoreboard gameState={gameState} />
          </div>
        )}

        {gameState.status === 'selecting' && (
          <div className="mb-6">
            <GameBoard gameState={gameState} showValues={true} readOnly={true} />
          </div>
        )}

        {(gameState.status === 'clueRevealed' || gameState.status === 'buzzing' || 
          gameState.status === 'answering' || gameState.status === 'judging') && (
          <div className="mb-6">
            <ClueDisplay gameState={gameState} showAnswer={gameState.status === 'judging'} />
          </div>
        )}

        {gameState.status === 'finalJeopardyWagering' && gameState.config && (
          <div className="bg-blue-800 p-8 rounded-lg text-white text-center">
            <h2 className="text-4xl font-bold mb-4">FINAL JEOPARDY!</h2>
            <p className="text-2xl mb-4">Category: {gameState.config.finalJeopardy.category}</p>
            <p className="text-xl">Players are placing their wagers...</p>
          </div>
        )}

        {gameState.status === 'finalJeopardyAnswering' && gameState.config && (
          <div className="bg-blue-800 p-8 rounded-lg text-white">
            <h2 className="text-4xl font-bold mb-4 text-center">FINAL JEOPARDY!</h2>
            <div className="text-center mb-6">
              <p className="text-2xl mb-4">Category: {gameState.config.finalJeopardy.category}</p>
              <p className="text-3xl font-bold mb-4">{gameState.config.finalJeopardy.clue}</p>
            </div>
            <p className="text-xl text-center">Players are writing their answers...</p>
          </div>
        )}

        {gameState.status === 'finalJeopardyReveal' && gameState.config && (
          <div className="bg-blue-800 p-8 rounded-lg text-white">
            <h2 className="text-4xl font-bold mb-4 text-center">FINAL JEOPARDY!</h2>
            <div className="text-center mb-6">
              <p className="text-2xl mb-4">Category: {gameState.config.finalJeopardy.category}</p>
              <p className="text-3xl font-bold mb-4">{gameState.config.finalJeopardy.clue}</p>
              {/* Answer is never shown on game display */}
            </div>
            <div className="mt-8">
              <Scoreboard gameState={gameState} />
            </div>
          </div>
        )}

        {gameState.status === 'finished' && (
          <div className="bg-blue-800 p-8 rounded-lg text-white text-center">
            <h2 className="text-4xl font-bold mb-4">GAME OVER</h2>
            <div className="mt-8">
              <Scoreboard gameState={gameState} />
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => setShowScores(!showScores)}
            className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            {showScores ? 'Hide' : 'Show'} Scores
          </button>
        </div>
      </div>
    </main>
  );
}

