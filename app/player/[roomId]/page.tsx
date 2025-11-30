'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createGameClient } from '@/lib/game-client-factory';
import { IGameClient } from '@/lib/game-client-interface';
import { GameState, ServerMessage } from '@/shared/types';
import Buzzer from '@/components/Buzzer/Buzzer';
import Scoreboard from '@/components/Scoreboard/Scoreboard';

export default function PlayerPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const [gameClient, setGameClient] = useState<IGameClient | null>(null);
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
    const client = createGameClient();

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

        setGameClient(client);
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
    if (gameClient && !buzzerLocked && !buzzed) {
      const delayMs = earlyBuzzPenalty ? 250 : 0;

      if (delayMs > 0) {
        // Apply penalty delay
        setTimeout(() => {
          setBuzzed(true);
          gameClient.buzz();
        }, delayMs);
      } else {
        // No penalty, buzz immediately
        setBuzzed(true);
        gameClient.buzz();
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
    if (gameClient && finalWager) {
      const wager = parseInt(finalWager);
      if (!isNaN(wager) && wager >= 0) {
        gameClient.submitWager(wager);
        setFinalWager('');
      }
    }
  };

  const handleSubmitFinalAnswer = () => {
    if (gameClient && finalAnswer) {
      gameClient.submitFinalAnswer(finalAnswer);
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
      <main className="flex min-h-screen items-center justify-center bg-blue-900">
        <div className="text-white">Connecting...</div>
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
  // Use != null to check for both null and undefined
  const hasWagered = player?.finalJeopardyWager != null;
  const hasAnswered = player?.finalJeopardyAnswer != null;

  // Check if a clue is revealed (for regular rounds, not Final Jeopardy)
  const isClueRevealed =
    gameState.status === 'clueRevealed' ||
    gameState.status === 'buzzing' ||
    gameState.status === 'answering' ||
    gameState.status === 'judging';

  // Get clue information if revealed
  let selectedCategory = null;
  let selectedClue = null;
  if (
    isClueRevealed &&
    gameState.config &&
    gameState.selectedClue &&
    gameState.currentRound !== 'finalJeopardy'
  ) {
    const round =
      gameState.currentRound === 'jeopardy'
        ? gameState.config.jeopardy
        : gameState.config.doubleJeopardy;

    selectedCategory = round.categories.find(
      (c) => c.id === gameState.selectedClue!.categoryId,
    );
    selectedClue = selectedCategory?.clues.find(
      (c) => c.id === gameState.selectedClue!.clueId,
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-top p-4 bg-blue-900">
      <div className="w-full max-w-2xl">
        {!isConnected && (
          <div className="mb-4 p-4 bg-red-900/50 border-2 border-red-500 rounded-lg">
            <p className="text-red-200 font-bold text-lg">
              ⚠️ Disconnected from server. Attempting to reconnect...
            </p>
          </div>
        )}
        <div className={`${isClueRevealed ? 'mb-4' : 'mb-8'}`}>
          <h1 className="text-sm font-bold mb-4 text-white uppercase tracking-wider">
            Room: {roomId}
          </h1>
          {player && (
            <div className="text-2xl">
              <span className="font-bold text-white">{player.name}</span>
              <span
                className={`ml-4 ${player.score >= 0 ? 'text-green-300' : 'text-red-500'}`}
              >
                ${player.score.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {(gameState.status === 'finalJeopardyCategory' ||
          isFinalJeopardyWagering) && (
          <div className="bg-blue-800 p-6 rounded-lg shadow-lg mb-4 border border-blue-700">
            <h2 className="text-2xl font-bold mb-4 text-white">
              Final Jeopardy - Place Your Wager
            </h2>
            {player && player.score <= 0 ? (
              <div className="text-center py-8">
                <p className="text-xl text-gray-300 mb-2">
                  Unfortunately, you cannot participate in Final Jeopardy
                </p>
                <p className="text-lg text-gray-400">
                  Your score is ${player.score}
                </p>
                <p className="text-lg text-gray-400 mt-4">
                  Thank you for playing!
                </p>
              </div>
            ) : (
              <>
                <p className="mb-4 text-lg text-white">
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
                      className={`w-full px-6 py-4 text-2xl border-2 rounded-lg bg-blue-800 text-white placeholder-gray-400 focus:outline-none ${
                        finalWager &&
                        (parseInt(finalWager, 10) < 0 ||
                          parseInt(finalWager, 10) > (player?.score || 0))
                          ? 'border-red-500 focus:border-red-500'
                          : 'border-blue-600 focus:border-yellow-400'
                      }`}
                      disabled={hasWagered}
                      min="0"
                      max={player?.score || 0}
                    />
                    {finalWager &&
                      (parseInt(finalWager, 10) < 0 ||
                        parseInt(finalWager, 10) > (player?.score || 0)) && (
                        <p className="mt-2 text-sm text-red-500">
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
                    className="px-8 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 text-xl font-bold transition-colors"
                  >
                    {hasWagered ? 'Wager Submitted ✓' : 'Submit Wager'}
                  </button>
                </div>
                {hasWagered && (
                  <p className="mt-4 text-green-300 text-lg font-bold">
                    Wager submitted: ${player?.finalJeopardyWager}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {gameState.status === 'finalJeopardyClueReading' && (
          <div className="bg-blue-800 p-6 rounded-lg shadow-lg mb-4 border border-blue-700">
            <h2 className="text-2xl font-bold mb-4 text-white">
              Final Jeopardy
            </h2>
            {player && player.score <= 0 ? (
              <div className="text-center py-8">
                <p className="text-xl text-gray-300 mb-2">
                  Unfortunately, you cannot participate in Final Jeopardy
                </p>
                <p className="text-lg text-gray-400">
                  Your score is ${player.score}
                </p>
                <p className="text-lg text-gray-400 mt-4">
                  Thank you for playing!
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <p className="text-lg mb-2 text-white">
                    Your wager:{' '}
                    <span className="font-bold text-2xl">
                      ${player?.finalJeopardyWager || 0}
                    </span>
                  </p>
                </div>
                <p className="text-lg text-gray-300 text-center py-8">
                  Listen to the clue... Timer will start soon.
                </p>
              </>
            )}
          </div>
        )}

        {isFinalJeopardyAnswering && (
          <div className="bg-blue-800 p-6 rounded-lg shadow-lg mb-4 border border-blue-700">
            <h2 className="text-2xl font-bold mb-4 text-white">
              Final Jeopardy - Your Answer
            </h2>
            {player && player.score <= 0 ? (
              <div className="text-center py-8">
                <p className="text-xl text-gray-300 mb-2">
                  Unfortunately, you cannot participate in Final Jeopardy
                </p>
                <p className="text-lg text-gray-400">
                  Your score is ${player.score}
                </p>
                <p className="text-lg text-gray-400 mt-4">
                  Thank you for playing!
                </p>
              </div>
            ) : (
              <>
                {countdown !== null && (
                  <div className="mb-4 p-4 bg-red-900/50 rounded-lg border border-red-500">
                    <p className="text-xl font-bold text-red-200">
                      Time remaining: {countdown} seconds
                    </p>
                  </div>
                )}
                <div className="mb-4">
                  <p className="text-lg mb-2 text-white">
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
                    className="w-full px-6 py-4 text-xl border-2 border-blue-600 bg-blue-900 text-white placeholder-gray-400 rounded-lg focus:border-yellow-400 focus:outline-none"
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
                    className="px-8 py-4 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-400 text-xl font-bold transition-colors"
                  >
                    {hasAnswered
                      ? 'Answer Submitted ✓'
                      : countdown !== null && countdown <= 0
                        ? 'Time Expired'
                        : 'Submit Answer'}
                  </button>
                </div>
                {hasAnswered && (
                  <p className="mt-4 text-green-300 text-lg font-bold">
                    Answer submitted!
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {gameState.status === 'finalJeopardyJudging' && (
          <div className="bg-blue-800 p-6 rounded-lg shadow-lg mb-4 border border-blue-700">
            <h2 className="text-2xl font-bold mb-4 text-white">
              Final Jeopardy - Judging
            </h2>
            <p className="text-lg text-gray-300">
              Please wait while the host judges all players...
            </p>
          </div>
        )}

        {gameState.status === 'finished' && (
          <div className="bg-blue-800 p-6 rounded-lg shadow-lg mb-4 border border-blue-700">
            <h2 className="text-2xl font-bold mb-4 text-white">Game Over</h2>
            <p className="text-lg mb-4 text-white">
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
            <>
              <div className={isClueRevealed ? 'mb-6' : ''}>
                <Buzzer
                  locked={buzzerLocked}
                  onBuzz={handleBuzz}
                  onEarlyBuzz={handleEarlyBuzz}
                  buzzed={buzzed}
                  showTooSoonMessage={showTooSoonMessage}
                />
              </div>

              {isClueRevealed && selectedClue && selectedCategory && (
                <div className="bg-blue-800 p-6 rounded-lg shadow-lg border border-blue-700">
                  <div className="mb-4 text-center">
                    <div className="text-xl font-bold text-yellow-300 uppercase tracking-wide mb-2">
                      <span className="category-text">
                        {selectedCategory.name}
                      </span>
                    </div>
                    <div className="text-xl font-bold text-yellow-400">
                      ${selectedClue.value.toLocaleString()}
                    </div>
                  </div>

                  <div className="clue-text text-2xl font-bold text-white text-center leading-tight min-h-[150px] flex items-center justify-center px-4">
                    {selectedClue.clue}
                  </div>
                </div>
              )}
            </>
          )}

        {/* <div className="mt-8">
          <Scoreboard gameState={gameState} highlightPlayer={playerId} />
        </div> */}
      </div>
    </main>
  );
}
