'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';
import { GameState, ServerMessage } from '@/shared/types';
import Buzzer from '@/components/Buzzer/Buzzer';
import Scoreboard from '@/components/Scoreboard/Scoreboard';

import { getWebSocketUrl } from '@/lib/websocket-url';

const WS_URL = getWebSocketUrl();

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const [ws, setWs] = useState<WebSocketClient | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [buzzerLocked, setBuzzerLocked] = useState(true);
  const [buzzed, setBuzzed] = useState(false);
  const [finalWager, setFinalWager] = useState('');
  const [finalAnswer, setFinalAnswer] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  const connectedRef = useRef(false);
  const playerIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Check localStorage for existing player info
    const storedPlayerInfo = localStorage.getItem(`player_${roomId}`);
    if (storedPlayerInfo) {
      try {
        const { playerId: storedPlayerId, playerName } = JSON.parse(storedPlayerInfo);
        playerIdRef.current = storedPlayerId;
        setPlayerId(storedPlayerId);
      } catch (e) {
        // Invalid stored data, clear it
        localStorage.removeItem(`player_${roomId}`);
      }
    }

    // If no stored info, redirect to join page
    if (!storedPlayerInfo) {
      router.push(`/join?room=${roomId}`);
      return;
    }

    // Only connect once
    if (connectedRef.current) {
      return;
    }

    connectedRef.current = true;
    const client = new WebSocketClient(WS_URL, false); // Start with auto-reconnect disabled
    
    // Listen for connection state changes
    const unsubscribeConnectionState = client.onConnectionStateChange((connected) => {
      setIsConnected(connected);
      if (connected) {
        // When reconnected, rejoin the room
        const storedInfo = localStorage.getItem(`player_${roomId}`);
        if (storedInfo) {
          const { playerName, playerId: storedPlayerId } = JSON.parse(storedInfo);
          client.joinRoom(roomId, playerName, 'player', storedPlayerId);
        }
      } else {
        // Enable auto-reconnect when disconnected
        client.enableAutoReconnect();
      }
    });
    
    client.connect().then(() => {
      const storedInfo = localStorage.getItem(`player_${roomId}`);
      if (storedInfo) {
        const { playerName, playerId: storedPlayerId } = JSON.parse(storedInfo);
        // Pass stored playerId to joinRoom so server knows this is a reconnect
        client.joinRoom(roomId, playerName, 'player', storedPlayerId);
      } else {
        // No stored info, redirect to join
        router.push(`/join?room=${roomId}`);
        return;
      }
      
      client.on('roomJoined', (message: any) => {
        setGameState(message.gameState);
        setPlayerId(message.playerId);
        playerIdRef.current = message.playerId;
        client.setPlayerId(message.playerId);
      });

      client.on('gameStateUpdate', (message: any) => {
        setGameState(message.gameState);
        // Check if this player has buzzed (in buzzerOrder)
        const hasBuzzed = message.gameState.buzzerOrder?.includes(playerIdRef.current) || false;
        setBuzzed(hasBuzzed);
        // Reset buzzed state when new clue is selected
        if (message.gameState.status === 'clueRevealed' || message.gameState.status === 'selecting') {
          setBuzzed(false);
        }
      });

      client.on('buzzerLocked', (message: any) => {
        setBuzzerLocked(message.locked);
      });

      client.on('buzzReceived', (message: any) => {
        // Mark as buzzed immediately when this player buzzes
        if (message.playerId === playerIdRef.current) {
          setBuzzed(true);
        }
      });

      setWs(client);
    }).catch((error) => {
      console.error('Connection error:', error);
      connectedRef.current = false;
      setIsConnected(false);
      // Enable auto-reconnect on initial connection failure
      client.enableAutoReconnect();
    });

    return () => {
      unsubscribeConnectionState();
      connectedRef.current = false;
      client.disconnect();
    };
  }, [roomId, router]);

  const handleBuzz = () => {
    // Allow buzzing even if already buzzed (in case of network issues)
    // Server will handle duplicate prevention
    // Set buzzed state immediately for better UX (will be confirmed by server)
    if (ws && !buzzerLocked) {
      setBuzzed(true); // Optimistic update - show "BUZZED" immediately
      ws.buzz();
    }
  };

  const handleSubmitWager = () => {
    if (ws && finalWager) {
      const wager = parseInt(finalWager);
      if (!isNaN(wager) && wager >= 0) {
        ws.submitWager(wager);
        setFinalWager('');
      }
    }
  };

  const handleSubmitFinalAnswer = () => {
    if (ws && finalAnswer) {
      ws.submitFinalAnswer(finalAnswer);
      setFinalAnswer('');
    }
  };

  if (!gameState || !playerId) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div>Connecting...</div>
      </main>
    );
  }

  // Convert players array to Map for easier access
  const playersMap = new Map(
    Array.isArray(gameState.players) 
      ? gameState.players.map((p: any) => [p.id, p])
      : Array.from(gameState.players.entries?.() || [])
  );
  const player = playersMap.get(playerId);
  const isFinalJeopardyWagering = gameState.status === 'finalJeopardyWagering';
  const isFinalJeopardyAnswering = gameState.status === 'finalJeopardyAnswering';
  const hasWagered = player?.finalJeopardyWager !== undefined;
  const hasAnswered = player?.finalJeopardyAnswer !== undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-100">
      <div className="w-full max-w-2xl">
        {!isConnected && (
          <div className="mb-4 p-4 bg-red-100 border-2 border-red-500 rounded-lg">
            <p className="text-red-600 font-bold text-lg">⚠️ Disconnected from server. Attempting to reconnect...</p>
          </div>
        )}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Room: {roomId}</h1>
          {player && (
            <div className="text-2xl">
              <span className="font-bold">{player.name}</span>
              <span className={`ml-4 ${player.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${player.score.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {isFinalJeopardyWagering && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-4">
            <h2 className="text-2xl font-bold mb-4">Final Jeopardy - Place Your Wager</h2>
            <p className="mb-4">Your current score: ${player?.score || 0}</p>
            <div className="flex gap-4">
              <input
                type="number"
                value={finalWager}
                onChange={(e) => setFinalWager(e.target.value)}
                placeholder="Wager amount"
                className="flex-1 px-4 py-2 border rounded"
                disabled={hasWagered}
                min="0"
                max={player?.score || 0}
              />
              <button
                onClick={handleSubmitWager}
                disabled={hasWagered || !finalWager}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {hasWagered ? 'Wagered' : 'Submit Wager'}
              </button>
            </div>
            {hasWagered && <p className="mt-2 text-green-600">Wager submitted: ${player?.finalJeopardyWager}</p>}
          </div>
        )}

        {isFinalJeopardyAnswering && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-4">
            <h2 className="text-2xl font-bold mb-4">Final Jeopardy - Your Answer</h2>
            <div className="flex gap-4">
              <input
                type="text"
                value={finalAnswer}
                onChange={(e) => setFinalAnswer(e.target.value)}
                placeholder="Your answer (in the form of a question)"
                className="flex-1 px-4 py-2 border rounded"
                disabled={hasAnswered}
              />
              <button
                onClick={handleSubmitFinalAnswer}
                disabled={hasAnswered || !finalAnswer}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {hasAnswered ? 'Submitted' : 'Submit Answer'}
              </button>
            </div>
            {hasAnswered && <p className="mt-2 text-green-600">Answer submitted!</p>}
          </div>
        )}

        {!isFinalJeopardyWagering && !isFinalJeopardyAnswering && (
          <Buzzer
            locked={buzzerLocked}
            onBuzz={handleBuzz}
            buzzed={buzzed}
          />
        )}

        <div className="mt-8">
          <Scoreboard gameState={gameState} highlightPlayer={playerId} />
        </div>
      </div>
    </main>
  );
}

