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
  const [earlyBuzzPenalty, setEarlyBuzzPenalty] = useState(false);
  const [showTooSoonMessage, setShowTooSoonMessage] = useState(false);
  const [finalWager, setFinalWager] = useState('');
  const [finalAnswer, setFinalAnswer] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const connectedRef = useRef(false);
  const playerIdRef = useRef<string | null>(null);
  const earlyBuzzTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check localStorage for existing player info
    const storedPlayerInfo = localStorage.getItem(`player_${roomId}`);
    if (storedPlayerInfo) {
      try {
        const { playerId: storedPlayerId, playerName } =
          JSON.parse(storedPlayerInfo);
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
    const unsubscribeConnectionState = client.onConnectionStateChange(
      (connected) => {
        setIsConnected(connected);
        if (connected) {
          // When reconnected, rejoin the room
          const storedInfo = localStorage.getItem(`player_${roomId}`);
          if (storedInfo) {
            const { playerName, playerId: storedPlayerId } =
              JSON.parse(storedInfo);
            client.joinRoom(roomId, playerName, 'player', storedPlayerId);
          }
        } else {
          // Enable auto-reconnect when disconnected
          client.enableAutoReconnect();
        }
      },
    );

    client
      .connect()
      .then(() => {
        const storedInfo = localStorage.getItem(`player_${roomId}`);
        if (storedInfo) {
          const { playerName, playerId: storedPlayerId } =
            JSON.parse(storedInfo);
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
          const hasBuzzed =
            message.gameState.buzzerOrder?.includes(playerIdRef.current) ||
            false;
          setBuzzed(hasBuzzed);
          // Reset buzzed state and early buzz penalty when new clue is selected
          if (
            message.gameState.status === 'clueRevealed' ||
            message.gameState.status === 'selecting'
          ) {
            setBuzzed(false);
            setEarlyBuzzPenalty(false);
            setShowTooSoonMessage(false);
            if (earlyBuzzTimeoutRef.current) {
              clearTimeout(earlyBuzzTimeoutRef.current);
              earlyBuzzTimeoutRef.current = null;
            }
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
      })
      .catch((error) => {
        console.warn('Connection error:', error);
        connectedRef.current = false;
        setIsConnected(false);
        // Enable auto-reconnect on initial connection failure
        client.enableAutoReconnect();
      });

    return () => {
      unsubscribeConnectionState();
      connectedRef.current = false;
      if (earlyBuzzTimeoutRef.current) {
        clearTimeout(earlyBuzzTimeoutRef.current);
      }
      client.disconnect();
    };
  }, [roomId, router]);

  const handleBuzz = () => {
    // Normal buzz - check for early buzz penalty
    if (ws && !buzzerLocked && !buzzed) {
      const delayMs = earlyBuzzPenalty ? 250 : 0;

      if (delayMs > 0) {
        // Apply penalty delay
        setTimeout(() => {
          setBuzzed(true);
          ws.buzz();
        }, delayMs);
      } else {
        // No penalty, buzz immediately
        setBuzzed(true);
        ws.buzz();
      }
    }
  };

  const handleEarlyBuzz = () => {
    // Only apply penalty during clue reading (clueRevealed status)
    if (gameState?.status !== 'clueRevealed') {
      return;
    }

    // Set early buzz penalty (not cumulative)
    if (!earlyBuzzPenalty) {
      setEarlyBuzzPenalty(true);
      setShowTooSoonMessage(true);

      // Clear "Too soon!" message after 3 seconds
      if (earlyBuzzTimeoutRef.current) {
        clearTimeout(earlyBuzzTimeoutRef.current);
      }
      earlyBuzzTimeoutRef.current = setTimeout(() => {
        setShowTooSoonMessage(false);
      }, 3000);
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

  // Update countdown timer (must be before early return to follow Rules of Hooks)
  useEffect(() => {
    if (!gameState?.finalJeopardyCountdownEnd) {
      setCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.floor((gameState.finalJeopardyCountdownEnd! - Date.now()) / 1000),
      );
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 100);

    return () => clearInterval(interval);
  }, [gameState?.finalJeopardyCountdownEnd]);

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
      : Array.from(gameState.players.entries?.() || []),
  );
  const player = playersMap.get(playerId);
  const isFinalJeopardyWagering = gameState.status === 'finalJeopardyWagering';
  const isFinalJeopardyAnswering =
    gameState.status === 'finalJeopardyAnswering';
  const hasWagered = player?.finalJeopardyWager !== undefined;
  const hasAnswered = player?.finalJeopardyAnswer !== undefined;

  return (
    <main className="flex min-h-screen flex-col items-center justify-top p-8 bg-gray-100">
      <div className="w-full max-w-2xl">
        {!isConnected && (
          <div className="mb-4 p-4 bg-red-100 border-2 border-red-500 rounded-lg">
            <p className="text-red-600 font-bold text-lg">
              ⚠️ Disconnected from server. Attempting to reconnect...
            </p>
          </div>
        )}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Room: {roomId}</h1>
          {player && (
            <div className="text-2xl">
              <span className="font-bold">{player.name}</span>
              <span
                className={`ml-4 ${player.score >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                ${player.score.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {(gameState.status === 'finalJeopardyCategory' ||
          isFinalJeopardyWagering) && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-4">
            <h2 className="text-2xl font-bold mb-4">
              Final Jeopardy - Place Your Wager
            </h2>
            {player && player.score <= 0 ? (
              <div className="text-center py-8">
                <p className="text-xl text-gray-600 mb-2">
                  Unfortunately, you cannot participate in Final Jeopardy
                </p>
                <p className="text-lg text-gray-500">
                  Your score is ${player.score}
                </p>
                <p className="text-lg text-gray-500 mt-4">
                  Thank you for playing!
                </p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-lg">
                  Your current score:{' '}
                  <span className="font-bold text-2xl">
                    ${player?.score || 0}
                  </span>
                </p>
                <div className="flex flex-col gap-4">
                  <div>
                    <input
                      type="number"
                      value={finalWager}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string for clearing
                        if (value === '') {
                          setFinalWager('');
                          return;
                        }
                        // Only allow digits
                        if (!/^\d+$/.test(value)) {
                          return;
                        }
                        const numValue = parseInt(value, 10);
                        const maxScore = player?.score || 0;
                        // Clamp value between 0 and max score
                        if (numValue >= 0 && numValue <= maxScore) {
                          setFinalWager(value);
                        } else if (numValue > maxScore) {
                          // If user types a number greater than max, set to max
                          setFinalWager(maxScore.toString());
                        }
                        // If negative, don't update (prevent negative values)
                      }}
                      placeholder="Wager amount (0 to your score)"
                      className={`w-full px-6 py-4 text-2xl border-2 rounded-lg focus:outline-none ${
                        finalWager &&
                        (parseInt(finalWager, 10) < 0 ||
                          parseInt(finalWager, 10) > (player?.score || 0))
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:border-blue-500'
                      }`}
                      disabled={hasWagered}
                      min="0"
                      max={player?.score || 0}
                    />
                    {finalWager &&
                      (parseInt(finalWager, 10) < 0 ||
                        parseInt(finalWager, 10) > (player?.score || 0)) && (
                        <p className="mt-2 text-sm text-red-600">
                          Wager must be between $0 and ${player?.score || 0}
                        </p>
                      )}
                  </div>
                  <button
                    onClick={handleSubmitWager}
                    disabled={
                      hasWagered ||
                      !finalWager ||
                      parseInt(finalWager, 10) < 0 ||
                      parseInt(finalWager, 10) > (player?.score || 0)
                    }
                    className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-xl font-bold"
                  >
                    {hasWagered ? 'Wager Submitted ✓' : 'Submit Wager'}
                  </button>
                </div>
                {hasWagered && (
                  <p className="mt-4 text-green-600 text-lg font-bold">
                    Wager submitted: ${player?.finalJeopardyWager}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {isFinalJeopardyAnswering && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-4">
            <h2 className="text-2xl font-bold mb-4">
              Final Jeopardy - Your Answer
            </h2>
            {player && player.score <= 0 ? (
              <div className="text-center py-8">
                <p className="text-xl text-gray-600 mb-2">
                  Unfortunately, you cannot participate in Final Jeopardy
                </p>
                <p className="text-lg text-gray-500">
                  Your score is ${player.score}
                </p>
                <p className="text-lg text-gray-500 mt-4">
                  Thank you for playing!
                </p>
              </div>
            ) : (
              <>
                {countdown !== null && (
                  <div className="mb-4 p-4 bg-red-100 rounded-lg">
                    <p className="text-xl font-bold text-red-600">
                      Time remaining: {countdown} seconds
                    </p>
                  </div>
                )}
                <div className="mb-4">
                  <p className="text-lg mb-2">
                    Your wager:{' '}
                    <span className="font-bold text-2xl">
                      ${player?.finalJeopardyWager || 0}
                    </span>
                  </p>
                </div>
                <div className="flex flex-col gap-4">
                  <input
                    type="text"
                    value={finalAnswer}
                    onChange={(e) => setFinalAnswer(e.target.value)}
                    placeholder="Your answer (in the form of a question)"
                    className="w-full px-6 py-4 text-xl border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                    disabled={
                      hasAnswered || (countdown !== null && countdown <= 0)
                    }
                  />
                  <button
                    onClick={handleSubmitFinalAnswer}
                    disabled={
                      hasAnswered ||
                      !finalAnswer ||
                      (countdown !== null && countdown <= 0)
                    }
                    className="px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 text-xl font-bold"
                  >
                    {hasAnswered
                      ? 'Answer Submitted ✓'
                      : countdown !== null && countdown <= 0
                        ? 'Time Expired'
                        : 'Submit Answer'}
                  </button>
                </div>
                {hasAnswered && (
                  <p className="mt-4 text-green-600 text-lg font-bold">
                    Answer submitted!
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {gameState.status === 'finalJeopardyJudging' && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-4">
            <h2 className="text-2xl font-bold mb-4">
              Final Jeopardy - Judging
            </h2>
            <p className="text-lg text-gray-600">
              Please wait while the host judges all players...
            </p>
          </div>
        )}

        {gameState.status === 'finished' && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-4">
            <h2 className="text-2xl font-bold mb-4">Game Over</h2>
            <p className="text-lg mb-4">
              Your final score:{' '}
              <span className="font-bold text-2xl">${player?.score || 0}</span>
            </p>
          </div>
        )}

        {!isFinalJeopardyWagering &&
          !isFinalJeopardyAnswering &&
          gameState.status !== 'finalJeopardyCategory' &&
          gameState.status !== 'finalJeopardyJudging' &&
          gameState.status !== 'finished' && (
            <Buzzer
              locked={buzzerLocked}
              onBuzz={handleBuzz}
              onEarlyBuzz={handleEarlyBuzz}
              buzzed={buzzed}
              showTooSoonMessage={showTooSoonMessage}
            />
          )}

        {/* <div className="mt-8">
          <Scoreboard gameState={gameState} highlightPlayer={playerId} />
        </div> */}
      </div>
    </main>
  );
}
