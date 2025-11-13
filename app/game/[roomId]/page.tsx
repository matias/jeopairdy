'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';
import { GameState, ServerMessage } from '@/shared/types';
import GameBoard from '@/components/GameBoard/GameBoard';
import ClueDisplay from '@/components/ClueDisplay/ClueDisplay';
import Scoreboard from '@/components/Scoreboard/Scoreboard';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export default function GameDisplayPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [ws, setWs] = useState<WebSocketClient | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showScores, setShowScores] = useState(true);

  useEffect(() => {
    const client = new WebSocketClient(WS_URL);
    client.connect().then(() => {
      client.joinRoom(roomId, undefined, 'player'); // Join as player to receive updates
      
      client.on('roomJoined', (message: any) => {
        setGameState(message.gameState);
      });

      client.on('gameStateUpdate', (message: any) => {
        setGameState(message.gameState);
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
            <GameBoard gameState={gameState} showValues={true} />
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
              <p className="text-2xl font-bold text-yellow-300 mt-6">
                Answer: {gameState.config.finalJeopardy.answer}
              </p>
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

