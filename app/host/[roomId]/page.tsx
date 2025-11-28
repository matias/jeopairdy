'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createGameClient } from '@/lib/game-client-factory';
import { IGameClient } from '@/lib/game-client-interface';
import { GameState, ServerMessage, Player } from '@/shared/types';
import GameBoard from '@/components/GameBoard/GameBoard';
import ClueDisplay from '@/components/ClueDisplay/ClueDisplay';
import Scoreboard from '@/components/Scoreboard/Scoreboard';

const BUZZER_TIMEOUT = 20; // 20 seconds

export default function HostPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [gameClient, setGameClient] = useState<IGameClient | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [scoreDelta, setScoreDelta] = useState<{ [playerId: string]: string }>(
    {},
  );
  const [buzzerCountdown, setBuzzerCountdown] = useState<number | null>(null);
  const buzzerUnlockTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const client = createGameClient();
    client
      .connect()
      .then(() => {
        client.joinRoom(roomId, undefined, 'host');

        client.on('roomJoined', (message: any) => {
          setGameState(message.gameState);
          setPlayerId(message.playerId);
          client.setPlayerId(message.playerId);
        });

        client.on('gameStateUpdate', (message: any) => {
          setGameState(message.gameState);
          if (message.gameState.status === 'selecting') {
            setShowAnswer(false);
          }
        });

        setGameClient(client);
      })
      .catch(console.error);

    return () => {
      client.disconnect();
    };
  }, [roomId]);

  // Track buzzer unlock time from game state
  useEffect(() => {
    if (gameState?.status === 'buzzing' && gameState.buzzerUnlockTime) {
      buzzerUnlockTimeRef.current = gameState.buzzerUnlockTime;
    } else if (
      gameState?.status === 'clueRevealed' ||
      gameState?.status === 'selecting'
    ) {
      buzzerUnlockTimeRef.current = null;
      setBuzzerCountdown(null);
    }
  }, [gameState?.status, gameState?.buzzerUnlockTime]);

  // Countdown timer effect
  useEffect(() => {
    if (!buzzerUnlockTimeRef.current || gameState?.status !== 'buzzing') {
      return;
    }

    const updateCountdown = () => {
      if (!buzzerUnlockTimeRef.current) return;
      const elapsed = (Date.now() - buzzerUnlockTimeRef.current) / 1000;
      const remaining = Math.max(0, BUZZER_TIMEOUT - elapsed);
      setBuzzerCountdown(Math.ceil(remaining));
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 100);

    return () => clearInterval(interval);
  }, [gameState?.status]);

  const handleSelectClue = (categoryId: string, clueId: string) => {
    if (gameClient) {
      gameClient.selectClue(categoryId, clueId);
    }
  };

  const handleUnlockBuzzers = () => {
    if (gameClient) {
      gameClient.unlockBuzzers();
    }
  };

  const handleRevealAnswer = () => {
    if (gameClient) {
      gameClient.revealAnswer();
      setShowAnswer(true);
    }
  };

  const handleJudgeAnswer = (playerId: string, correct: boolean) => {
    if (gameClient) {
      gameClient.judgeAnswer(correct, playerId);
    }
  };

  const handleUpdateScore = (playerId: string, delta: number) => {
    if (gameClient) {
      gameClient.updateScore(playerId, delta);
      setScoreDelta((prev) => ({ ...prev, [playerId]: '' }));
    }
  };

  const handleNextRound = () => {
    if (gameClient) {
      if (confirm('Are you sure you want to advance to the next round?')) {
        gameClient.nextRound();
      }
    }
  };

  const handleStartFinalJeopardy = () => {
    if (gameClient) {
      if (confirm('Are you sure you want to start Final Jeopardy?')) {
        gameClient.startFinalJeopardy();
      }
    }
  };

  const handleRevealFinalAnswers = () => {
    if (gameClient) {
      gameClient.revealFinalAnswers();
    }
  };

  const handleShowFinalJeopardyClue = () => {
    if (gameClient) {
      gameClient.showFinalJeopardyClue();
    }
  };

  const handleStartFinalJeopardyTimer = () => {
    if (gameClient) {
      gameClient.startFinalJeopardyTimer();
    }
  };

  const handleStartFinalJeopardyJudging = () => {
    if (gameClient) {
      gameClient.startFinalJeopardyJudging();
    }
  };

  const handleRevealFinalJeopardyWager = () => {
    if (gameClient) {
      gameClient.revealFinalJeopardyWager();
    }
  };

  const handleRevealFinalJeopardyAnswer = () => {
    if (gameClient) {
      gameClient.revealFinalJeopardyAnswer();
    }
  };

  const handleJudgeFinalJeopardyAnswer = (
    playerId: string,
    correct: boolean,
  ) => {
    if (gameClient) {
      gameClient.judgeFinalJeopardyAnswer(playerId, correct);
    }
  };

  const handleReturnToBoard = () => {
    if (gameClient) {
      gameClient.returnToBoard();
    }
  };

  const handleStartGame = () => {
    if (gameClient) {
      gameClient.startGame();
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
      : Array.from(gameState.players.entries?.() || []),
  );
  const players = Array.from(playersMap.values()).sort(
    (a, b) => b.score - a.score,
  );
  const currentPlayer = gameState.currentPlayer
    ? playersMap.get(gameState.currentPlayer)
    : null;
  // Use displayBuzzerOrder if available (static order for UI), otherwise fall back to resolvedBuzzerOrder or buzzerOrder
  const buzzerOrderToUse =
    gameState.displayBuzzerOrder && gameState.displayBuzzerOrder.length > 0
      ? gameState.displayBuzzerOrder
      : gameState.resolvedBuzzerOrder &&
          gameState.resolvedBuzzerOrder.length > 0
        ? gameState.resolvedBuzzerOrder
        : gameState.buzzerOrder;
  const buzzerOrder = buzzerOrderToUse
    .map((id) => playersMap.get(id))
    .filter(Boolean) as Player[];
  const judgedPlayers = gameState.judgedPlayers || [];

  if (!gameState.config) {
    return (
      <main className="min-h-screen p-8 bg-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-4xl font-bold mb-2">
              Host Control - Room {roomId}
            </h1>
          </div>
          <div className="bg-white p-8 rounded-lg shadow-lg text-center">
            <h2 className="text-2xl font-bold mb-4">No Game Loaded</h2>
            <p className="mb-6">Create or load a game config to get started.</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  const url = `/create-game?roomId=${roomId}`;
                  window.location.href = url;
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create New Game
              </button>
              <button
                onClick={() => {
                  const url = `/load-game?roomId=${roomId}`;
                  window.location.href = url;
                }}
                className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Load Saved Game
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (gameState.status === 'ready') {
    return (
      <main className="min-h-screen p-8 bg-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-4xl font-bold mb-2">
              Host Control - Room {roomId}
            </h1>
            <div className="text-lg text-gray-600">
              Game is ready to start. Players can still join.
            </div>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-lg mb-6">
            <h2 className="text-2xl font-bold mb-4">Players Joined</h2>
            {players.length === 0 ? (
              <p className="text-gray-600">No players have joined yet.</p>
            ) : (
              <div className="space-y-2">
                {players.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded"
                  >
                    <span className="font-semibold">{player.name}</span>
                    <span className="text-gray-600">
                      Score: ${player.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={() => {
                window.open(
                  `/game/${roomId}`,
                  '_blank',
                  'width=1920,height=1080',
                );
              }}
              className="px-6 py-4 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold"
            >
              Open Game Display
            </button>
            <button
              onClick={handleStartGame}
              disabled={players.length < 2}
              className={`px-8 py-4 rounded text-xl font-bold ${
                players.length < 2
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              Start Game {players.length < 2 && '(Need 2+ players)'}
            </button>
          </div>
          <div className="mt-4 text-center text-gray-600">
            <p>
              Ask users to join the game by scanning the QR code seen in the
              Game Display screen.
            </p>
            <p>
              They will need to be in the same WiFi network as the host&apos;s
              computer for local games.
            </p>
            <p className="mt-2">
              Join URL:{' '}
              <span className="font-mono text-blue-600">
                {typeof window !== 'undefined'
                  ? `${window.location.origin}/join?room=${roomId}`
                  : ''}
              </span>
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold">Host Control - Room {roomId}</h1>
            <div className="flex gap-2">
              <button
                style={{ display: 'none' }}
                onClick={() => {
                  if (!gameState.config) {
                    alert('No game loaded');
                    return;
                  }

                  // Extract just the config (not the game state)
                  const gameConfig = JSON.parse(
                    JSON.stringify(gameState.config),
                  );

                  // Reset revealed/answered flags so game can be replayed
                  [gameConfig.jeopardy, gameConfig.doubleJeopardy].forEach(
                    (round: any) => {
                      round.categories.forEach((category: any) => {
                        category.clues.forEach((clue: any) => {
                          clue.revealed = false;
                          clue.answered = false;
                        });
                      });
                    },
                  );

                  // Format as JSON string
                  const jsonString = JSON.stringify(gameConfig, null, 2);

                  // Log to console
                  console.log('=== GAME CONFIG JSON ===');
                  console.log(jsonString);
                  console.log('=== END GAME CONFIG ===');

                  // Copy to clipboard
                  navigator.clipboard
                    .writeText(jsonString)
                    .then(() => {
                      alert(
                        'Game config copied to clipboard and logged to console!',
                      );
                    })
                    .catch(() => {
                      alert(
                        'Game config logged to console. Open DevTools to copy it.',
                      );
                    });
                }}
                className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
                title="Dump current game config as JSON to console and clipboard"
              >
                Dump Game Config
              </button>
              <button
                onClick={() => {
                  window.open(
                    `/game/${roomId}`,
                    '_blank',
                    'width=1920,height=1080',
                  );
                }}
                className="px-6 py-3 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold"
                title="Open game display in a new window for presentation"
              >
                Open Game Display
              </button>
            </div>
          </div>
          <div className="text-lg">
            Round:{' '}
            {gameState.currentRound === 'jeopardy'
              ? 'Jeopardy'
              : gameState.currentRound === 'doubleJeopardy'
                ? 'Double Jeopardy'
                : 'Final Jeopardy'}{' '}
            | Status: {gameState.status}
          </div>
        </div>

        <div className="mb-6">
          <Scoreboard gameState={gameState} />
        </div>

        {gameState.status === 'selecting' && (
          <div className="mb-6">
            <GameBoard gameState={gameState} onSelectClue={handleSelectClue} />
          </div>
        )}

        {(gameState.status === 'clueRevealed' ||
          gameState.status === 'buzzing' ||
          gameState.status === 'answering' ||
          gameState.status === 'judging') && (
          <div className="mb-6">
            <ClueDisplay
              gameState={gameState}
              showAnswer={true}
              isHostView={true}
            />

            {/* Show resolved buzzer order and judging controls for host */}
            {(gameState.status === 'answering' ||
              gameState.status === 'judging') && (
              <div className="mt-4 bg-white p-6 rounded-lg shadow-lg">
                {buzzerOrder.length > 0 ? (
                  <>
                    <div className="text-xl font-bold mb-3 text-gray-800">
                      Buzzed In:
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {buzzerOrder.map((player, index) => {
                        const isCurrentPlayer = currentPlayer?.id === player.id;
                        const isJudged = judgedPlayers.includes(player.id);
                        return (
                          <span
                            key={player.id}
                            className={`px-3 py-1 rounded ${
                              isCurrentPlayer
                                ? 'bg-yellow-400 text-blue-900 font-bold border-2 border-blue-900'
                                : isJudged
                                  ? 'bg-gray-300 text-gray-600 line-through'
                                  : 'bg-yellow-300 text-blue-900'
                            }`}
                          >
                            {index + 1}. {player.name}
                            {isCurrentPlayer && ' (Current)'}
                            {isJudged && ' ✓'}
                          </span>
                        );
                      })}
                    </div>

                    {currentPlayer && (
                      <div>
                        <div className="flex gap-4">
                          <button
                            onClick={() =>
                              handleJudgeAnswer(currentPlayer.id, true)
                            }
                            disabled={judgedPlayers.includes(currentPlayer.id)}
                            className={`px-6 py-3 rounded ${
                              judgedPlayers.includes(currentPlayer.id)
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700'
                            } text-white font-bold`}
                          >
                            {judgedPlayers.includes(currentPlayer.id)
                              ? 'Judged ✓'
                              : 'Correct'}
                          </button>
                          <button
                            onClick={() =>
                              handleJudgeAnswer(currentPlayer.id, false)
                            }
                            disabled={judgedPlayers.includes(currentPlayer.id)}
                            className={`px-6 py-3 rounded ${
                              judgedPlayers.includes(currentPlayer.id)
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700'
                            } text-white font-bold`}
                          >
                            {judgedPlayers.includes(currentPlayer.id)
                              ? 'Judged ✓'
                              : 'Incorrect'}
                          </button>
                        </div>
                      </div>
                    )}

                    {!currentPlayer && (
                      <div className="pt-4 border-t-2 border-gray-200">
                        {judgedPlayers.length === buzzerOrder.length ? (
                          <p className="text-gray-600">
                            All players have been judged.
                          </p>
                        ) : (
                          <p className="text-gray-600">
                            No one buzzed in. The clue goes unanswered.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-600">
                    No one buzzed in. The clue goes unanswered.
                  </p>
                )}
              </div>
            )}

            {/* Unlock Buzzers button - shown during clueRevealed */}
            {gameState.status === 'clueRevealed' && (
              <div className="mt-4 bg-white p-4 rounded-lg shadow-lg">
                <button
                  onClick={handleUnlockBuzzers}
                  className="w-full px-6 py-4 bg-yellow-500 text-black rounded hover:bg-yellow-400 font-bold text-xl"
                >
                  🔔 Unlock Buzzers
                </button>
                <p className="text-gray-500 text-sm mt-2 text-center">
                  Click when you&apos;ve finished reading the clue
                </p>
              </div>
            )}

            {/* Countdown timer - shown during buzzing */}
            {gameState.status === 'buzzing' && buzzerCountdown !== null && (
              <div className="mt-4 bg-white p-4 rounded-lg shadow-lg">
                <div className="text-center">
                  <span className="text-lg font-bold text-gray-600">
                    Time remaining:{' '}
                  </span>
                  <span
                    className={`text-2xl font-bold ${
                      buzzerCountdown <= 5 ? 'text-red-600' : 'text-blue-600'
                    }`}
                  >
                    {buzzerCountdown}s
                  </span>
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-4">
              {!showAnswer && (
                <button
                  onClick={handleRevealAnswer}
                  className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Reveal Answer
                </button>
              )}
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
          <h2 className="text-2xl font-bold mb-4">Manual Score Adjustment</h2>
          <div className="grid grid-cols-3 gap-4">
            {[...players]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-2 justify-start text-left"
                >
                  <span className="text-left">{player.name}</span>
                  <input
                    type="text"
                    value={
                      scoreDelta[player.id] !== undefined
                        ? scoreDelta[player.id]
                        : ''
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty, negative sign, or valid number
                      if (
                        value === '' ||
                        value === '-' ||
                        /^-?\d*$/.test(value)
                      ) {
                        setScoreDelta((prev) => ({
                          ...prev,
                          [player.id]: value,
                        }));
                      }
                    }}
                    className="w-24 px-2 py-1 border rounded"
                    placeholder="±amount"
                  />
                  <button
                    onClick={() => {
                      const value = scoreDelta[player.id];
                      const numValue =
                        value === '' || value === '-'
                          ? 0
                          : parseInt(value) || 0;
                      handleUpdateScore(player.id, numValue);
                    }}
                    className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Apply
                  </button>
                </div>
              ))}
          </div>
        </div>

        <div className="flex gap-4">
          {gameState.status === 'selecting' &&
            gameState.currentRound === 'jeopardy' && (
              <button
                onClick={handleNextRound}
                className="px-6 py-3 bg-purple-600 text-white rounded hover:bg-purple-700"
              >
                Next Round
              </button>
            )}

          {gameState.currentRound === 'doubleJeopardy' &&
            gameState.status === 'selecting' && (
              <button
                onClick={handleStartFinalJeopardy}
                className="px-6 py-3 bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                Start Final Jeopardy
              </button>
            )}

          {gameState.status === 'finalJeopardyReveal' && (
            <button
              onClick={handleRevealFinalAnswers}
              className="px-6 py-3 bg-orange-600 text-white rounded hover:bg-orange-700"
            >
              Reveal Final Answers
            </button>
          )}
        </div>

        {(gameState.status === 'clueRevealed' ||
          gameState.status === 'buzzing' ||
          gameState.status === 'answering' ||
          gameState.status === 'judging') && (
          <div className="mt-6">
            <button
              onClick={handleReturnToBoard}
              className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Back to Board
            </button>
          </div>
        )}

        {(gameState.status === 'finalJeopardyCategory' ||
          gameState.status === 'finalJeopardyWagering') &&
          gameState.config && (
            <div className="bg-white p-6 rounded-lg shadow-lg mt-6">
              <h2 className="text-2xl font-bold mb-4">Final Jeopardy</h2>
              <div className="mb-4">
                <p className="text-lg font-bold">
                  Category: {gameState.config.finalJeopardy.category}
                </p>
              </div>
              {gameState.status === 'finalJeopardyWagering' && (
                <>
                  <div className="mb-4">
                    <h3 className="text-xl font-bold mb-2">Players Wagering</h3>
                    <div className="space-y-2">
                      {players
                        .filter((p) => p.score > 0)
                        .map((player) => (
                          <div
                            key={player.id}
                            className="flex items-center gap-4"
                          >
                            <span className="font-bold">{player.name}</span>
                            <span>Score: ${player.score}</span>
                            {player.finalJeopardyWager != null ? (
                              <span className="text-green-600">
                                Wagered: ${player.finalJeopardyWager}
                              </span>
                            ) : (
                              <span className="text-gray-500">Waiting...</span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                  <button
                    onClick={handleShowFinalJeopardyClue}
                    disabled={
                      !players
                        .filter((p) => p.score > 0)
                        .every((p) => p.finalJeopardyWager != null)
                    }
                    className={`px-6 py-3 rounded ${
                      players
                        .filter((p) => p.score > 0)
                        .every((p) => p.finalJeopardyWager != null)
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-gray-400 cursor-not-allowed'
                    } text-white font-bold`}
                  >
                    Show Clue
                  </button>
                </>
              )}
            </div>
          )}

        {gameState.status === 'finalJeopardyClueReading' && (
          <div className="bg-white p-6 rounded-lg shadow-lg mt-6">
            <h2 className="text-2xl font-bold mb-4">
              Final Jeopardy - Read the Clue
            </h2>
            <div className="mb-4">
              <p className="text-lg font-bold">
                Category: {gameState.config?.finalJeopardy.category}
              </p>
              <p className="text-xl mb-4 p-4 bg-blue-50 rounded">
                {gameState.config?.finalJeopardy.clue}
              </p>
            </div>
            <p className="text-gray-600 mb-4">
              Read the clue aloud, then click "Start Timer" when ready.
            </p>
            <button
              onClick={handleStartFinalJeopardyTimer}
              className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
            >
              Start Timer (60 seconds)
            </button>
          </div>
        )}

        {gameState.status === 'finalJeopardyAnswering' && (
          <div className="bg-white p-6 rounded-lg shadow-lg mt-6">
            <h2 className="text-2xl font-bold mb-4">
              Final Jeopardy - Players Answering
            </h2>
            <div className="mb-4">
              <p className="text-lg font-bold">
                Category: {gameState.config?.finalJeopardy.category}
              </p>
              <p className="text-lg mb-2">
                Clue: {gameState.config?.finalJeopardy.clue}
              </p>
            </div>
            <div className="space-y-2 mb-4">
              {players
                .filter((p) => p.score > 0)
                .map((player) => (
                  <div key={player.id} className="flex items-center gap-4">
                    <span className="font-bold">{player.name}</span>
                    {player.finalJeopardyAnswer ? (
                      <span className="text-green-600">Answer submitted</span>
                    ) : (
                      <span className="text-gray-500">Waiting...</span>
                    )}
                  </div>
                ))}
            </div>
            <button
              onClick={handleStartFinalJeopardyJudging}
              className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 font-bold"
            >
              Start Judging
            </button>
          </div>
        )}

        {gameState.status === 'finalJeopardyJudging' &&
          gameState.config &&
          gameState.finalJeopardyJudgingOrder &&
          gameState.finalJeopardyJudgingPlayerIndex !== undefined && (
            <div className="bg-white p-6 rounded-lg shadow-lg mt-6">
              <h2 className="text-2xl font-bold mb-4">
                Final Jeopardy - Judging
              </h2>
              <div className="mb-4">
                <p className="text-lg font-bold">
                  Category: {gameState.config.finalJeopardy.category}
                </p>
                <p className="text-lg mb-2">
                  Clue: {gameState.config.finalJeopardy.clue}
                </p>
                <p className="text-lg font-bold text-green-600">
                  Answer: {gameState.config.finalJeopardy.answer}
                </p>
              </div>
              {(() => {
                const currentPlayerId =
                  gameState.finalJeopardyJudgingOrder[
                    gameState.finalJeopardyJudgingPlayerIndex
                  ];
                const currentPlayer = players.find(
                  (p) => p.id === currentPlayerId,
                );
                if (!currentPlayer) return null;

                const initialScore = gameState.finalJeopardyInitialScores
                  ? typeof gameState.finalJeopardyInitialScores === 'object' &&
                    !Array.isArray(gameState.finalJeopardyInitialScores) &&
                    !(gameState.finalJeopardyInitialScores instanceof Map)
                    ? (
                        gameState.finalJeopardyInitialScores as Record<
                          string,
                          number
                        >
                      )[currentPlayerId]
                    : gameState.finalJeopardyInitialScores instanceof Map
                      ? gameState.finalJeopardyInitialScores.get(
                          currentPlayerId,
                        )
                      : undefined
                  : undefined;

                return (
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-100 rounded">
                      <p className="text-xl font-bold mb-2">
                        {currentPlayer.name}
                      </p>
                      {initialScore !== undefined && (
                        <p className="text-sm text-gray-600">
                          Initial Score: ${initialScore}
                        </p>
                      )}
                      {!gameState.finalJeopardyRevealedWager && (
                        <button
                          onClick={handleRevealFinalJeopardyWager}
                          className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Reveal Wager
                        </button>
                      )}
                      {gameState.finalJeopardyRevealedWager && (
                        <p className="text-lg mt-2">
                          Wager: ${currentPlayer.finalJeopardyWager || 0}
                        </p>
                      )}
                      {gameState.finalJeopardyRevealedWager &&
                        !gameState.finalJeopardyRevealedAnswer && (
                          <button
                            onClick={handleRevealFinalJeopardyAnswer}
                            className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Reveal Answer
                          </button>
                        )}
                      {gameState.finalJeopardyRevealedAnswer && (
                        <p className="text-lg mt-2">
                          Answer:{' '}
                          {currentPlayer.finalJeopardyAnswer || 'No answer'}
                        </p>
                      )}
                      {gameState.finalJeopardyRevealedWager &&
                        gameState.finalJeopardyRevealedAnswer && (
                          <div className="mt-4 flex gap-4">
                            <button
                              onClick={() =>
                                handleJudgeFinalJeopardyAnswer(
                                  currentPlayer.id,
                                  true,
                                )
                              }
                              className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
                            >
                              Correct
                            </button>
                            <button
                              onClick={() =>
                                handleJudgeFinalJeopardyAnswer(
                                  currentPlayer.id,
                                  false,
                                )
                              }
                              className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700 font-bold"
                            >
                              Incorrect
                            </button>
                          </div>
                        )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        {gameState.status === 'finished' && (
          <div className="bg-white p-6 rounded-lg shadow-lg mt-6">
            <h2 className="text-2xl font-bold mb-4">Game Over</h2>
            <div className="mt-4">
              <Scoreboard gameState={gameState} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
