'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';
import { GameState, ServerMessage, Player } from '@/shared/types';
import GameBoard from '@/components/GameBoard/GameBoard';
import ClueDisplay from '@/components/ClueDisplay/ClueDisplay';
import Scoreboard from '@/components/Scoreboard/Scoreboard';

import { getWebSocketUrl } from '@/lib/websocket-url';

const WS_URL = getWebSocketUrl();

export default function HostPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [ws, setWs] = useState<WebSocketClient | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [scoreDelta, setScoreDelta] = useState<{ [playerId: string]: string }>({});

  useEffect(() => {
    const client = new WebSocketClient(WS_URL);
    client.connect().then(() => {
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

      setWs(client);
    }).catch(console.error);

    return () => {
      client.disconnect();
    };
  }, [roomId]);

  const handleSelectClue = (categoryId: string, clueId: string) => {
    if (ws) {
      ws.selectClue(categoryId, clueId);
    }
  };

  const handleRevealAnswer = () => {
    if (ws) {
      ws.revealAnswer();
      setShowAnswer(true);
    }
  };

  const handleJudgeAnswer = (playerId: string, correct: boolean) => {
    if (ws) {
      ws.judgeAnswer(correct, playerId);
    }
  };

  const handleUpdateScore = (playerId: string, delta: number) => {
    if (ws) {
      ws.updateScore(playerId, delta);
      setScoreDelta(prev => ({ ...prev, [playerId]: '' }));
    }
  };

  const handleNextRound = () => {
    if (ws) {
      ws.nextRound();
    }
  };

  const handleStartFinalJeopardy = () => {
    if (ws) {
      ws.startFinalJeopardy();
    }
  };

  const handleRevealFinalAnswers = () => {
    if (ws) {
      ws.revealFinalAnswers();
    }
  };

  const handleReturnToBoard = () => {
    if (ws) {
      ws.returnToBoard();
    }
  };

  const handleStartGame = () => {
    if (ws) {
      ws.startGame();
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
  const players = Array.from(playersMap.values()).sort((a, b) => b.score - a.score);
  const currentPlayer = gameState.currentPlayer 
    ? playersMap.get(gameState.currentPlayer)
    : null;
  // Use displayBuzzerOrder if available (static order for UI), otherwise fall back to resolvedBuzzerOrder or buzzerOrder
  const buzzerOrderToUse = gameState.displayBuzzerOrder && gameState.displayBuzzerOrder.length > 0
    ? gameState.displayBuzzerOrder
    : (gameState.resolvedBuzzerOrder && gameState.resolvedBuzzerOrder.length > 0
      ? gameState.resolvedBuzzerOrder
      : gameState.buzzerOrder);
  const buzzerOrder = buzzerOrderToUse.map(id => playersMap.get(id)).filter(Boolean) as Player[];
  const judgedPlayers = gameState.judgedPlayers || [];

  if (!gameState.config) {
    return (
      <main className="min-h-screen p-8 bg-gray-100">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h1 className="text-4xl font-bold mb-2">Host Control - Room {roomId}</h1>
          </div>
          <div className="bg-white p-8 rounded-lg shadow-lg text-center">
            <h2 className="text-2xl font-bold mb-4">No Game Loaded</h2>
            <p className="mb-6">Create a new game to get started.</p>
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
            <h1 className="text-4xl font-bold mb-2">Host Control - Room {roomId}</h1>
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
                  <div key={player.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <span className="font-semibold">{player.name}</span>
                    <span className="text-gray-600">Score: ${player.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4 justify-center">
            <button
              onClick={handleStartGame}
              className="px-8 py-4 bg-green-600 text-white rounded hover:bg-green-700 text-xl font-bold"
            >
              Start Game
            </button>
            <button
              onClick={() => {
                window.open(`/game/${roomId}`, '_blank', 'width=1920,height=1080');
              }}
              className="px-6 py-4 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold"
            >
              Open Game Display
            </button>
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
                onClick={() => {
                  if (!gameState.config) {
                    alert('No game loaded');
                    return;
                  }
                  
                  // Extract just the config (not the game state)
                  const gameConfig = JSON.parse(JSON.stringify(gameState.config));
                  
                  // Reset revealed/answered flags so game can be replayed
                  [gameConfig.jeopardy, gameConfig.doubleJeopardy].forEach((round: any) => {
                    round.categories.forEach((category: any) => {
                      category.clues.forEach((clue: any) => {
                        clue.revealed = false;
                        clue.answered = false;
                      });
                    });
                  });
                  
                  // Format as JSON string
                  const jsonString = JSON.stringify(gameConfig, null, 2);
                  
                  // Log to console
                  console.log('=== GAME CONFIG JSON ===');
                  console.log(jsonString);
                  console.log('=== END GAME CONFIG ===');
                  
                  // Copy to clipboard
                  navigator.clipboard.writeText(jsonString).then(() => {
                    alert('Game config copied to clipboard and logged to console!');
                  }).catch(() => {
                    alert('Game config logged to console. Open DevTools to copy it.');
                  });
                }}
                className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 font-bold"
                title="Dump current game config as JSON to console and clipboard"
              >
                Dump Game Config
              </button>
              <button
                onClick={() => {
                  window.open(`/game/${roomId}`, '_blank', 'width=1920,height=1080');
                }}
                className="px-6 py-3 bg-purple-600 text-white rounded hover:bg-purple-700 font-bold"
                title="Open game display in a new window for presentation"
              >
                Open Game Display
              </button>
            </div>
          </div>
          <div className="text-lg">
            Round: {gameState.currentRound === 'jeopardy' ? 'Jeopardy' : 
                   gameState.currentRound === 'doubleJeopardy' ? 'Double Jeopardy' : 
                   'Final Jeopardy'} | 
            Status: {gameState.status}
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

        {(gameState.status === 'clueRevealed' || gameState.status === 'buzzing' || 
          gameState.status === 'answering' || gameState.status === 'judging') && (
          <div className="mb-6">
            <ClueDisplay 
              gameState={gameState} 
              showAnswer={true}
            />
            
            {/* Show resolved buzzer order and judging controls for host */}
            {(gameState.status === 'answering' || gameState.status === 'judging') && (
              <div className="mt-4 bg-white p-6 rounded-lg shadow-lg">
                {buzzerOrder.length > 0 ? (
                  <>
                    <div className="text-xl font-bold mb-3 text-gray-800">Buzzed In (Resolved Order):</div>
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
                            onClick={() => handleJudgeAnswer(currentPlayer.id, true)}
                            disabled={judgedPlayers.includes(currentPlayer.id)}
                            className={`px-6 py-3 rounded ${
                              judgedPlayers.includes(currentPlayer.id)
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700'
                            } text-white font-bold`}
                          >
                            {judgedPlayers.includes(currentPlayer.id) ? 'Judged ✓' : 'Correct'}
                          </button>
                          <button
                            onClick={() => handleJudgeAnswer(currentPlayer.id, false)}
                            disabled={judgedPlayers.includes(currentPlayer.id)}
                            className={`px-6 py-3 rounded ${
                              judgedPlayers.includes(currentPlayer.id)
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700'
                            } text-white font-bold`}
                          >
                            {judgedPlayers.includes(currentPlayer.id) ? 'Judged ✓' : 'Incorrect'}
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {!currentPlayer && (
                      <div className="pt-4 border-t-2 border-gray-200">
                        {judgedPlayers.length === buzzerOrder.length ? (
                          <p className="text-gray-600">All players have been judged.</p>
                        ) : (
                          <p className="text-gray-600">No one buzzed in. The clue goes unanswered.</p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-600">No one buzzed in. The clue goes unanswered.</p>
                )}
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
          <div className="grid grid-cols-2 gap-4">
            {[...players].sort((a, b) => a.name.localeCompare(b.name)).map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                <span className="flex-1">{player.name}</span>
                <input
                  type="text"
                  value={scoreDelta[player.id] !== undefined ? scoreDelta[player.id] : ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty, negative sign, or valid number
                    if (value === '' || value === '-' || /^-?\d*$/.test(value)) {
                      setScoreDelta(prev => ({
                        ...prev,
                        [player.id]: value
                      }));
                    }
                  }}
                  className="w-24 px-2 py-1 border rounded"
                  placeholder="±amount"
                />
                <button
                  onClick={() => {
                    const value = scoreDelta[player.id];
                    const numValue = value === '' || value === '-' ? 0 : parseInt(value) || 0;
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
          {gameState.currentRound === 'doubleJeopardy' && gameState.status === 'selecting' && (
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

        {(gameState.status === 'clueRevealed' || gameState.status === 'buzzing' || 
          gameState.status === 'answering' || gameState.status === 'judging') && (
          <div className="mt-6">
            <button
              onClick={handleReturnToBoard}
              className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Back to Board
            </button>
          </div>
        )}

        {gameState.status === 'finalJeopardyWagering' && (
          <div className="bg-white p-6 rounded-lg shadow-lg mt-6">
            <h2 className="text-2xl font-bold mb-4">Final Jeopardy - Players Wagering</h2>
            <div className="space-y-2">
              {players.map((player) => (
                <div key={player.id} className="flex items-center gap-4">
                  <span className="font-bold">{player.name}</span>
                  <span>Score: ${player.score}</span>
                  {player.finalJeopardyWager !== undefined ? (
                    <span className="text-green-600">Wagered: ${player.finalJeopardyWager}</span>
                  ) : (
                    <span className="text-gray-500">Waiting...</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {gameState.status === 'finalJeopardyAnswering' && (
          <div className="bg-white p-6 rounded-lg shadow-lg mt-6">
            <h2 className="text-2xl font-bold mb-4">Final Jeopardy - Players Answering</h2>
            <div className="space-y-2">
              {players.map((player) => (
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
          </div>
        )}

        {gameState.status === 'finalJeopardyReveal' && gameState.config && (
          <div className="bg-white p-6 rounded-lg shadow-lg mt-6">
            <h2 className="text-2xl font-bold mb-4">Final Jeopardy Results</h2>
            <div className="mb-4">
              <p className="text-lg font-bold">Category: {gameState.config.finalJeopardy.category}</p>
              <p className="text-lg mb-2">Clue: {gameState.config.finalJeopardy.clue}</p>
              <p className="text-lg font-bold text-green-600">Answer: {gameState.config.finalJeopardy.answer}</p>
            </div>
            <div className="space-y-2">
              {players.map((player) => (
                <div key={player.id} className="flex items-center gap-4">
                  <span className="font-bold">{player.name}</span>
                  <span>Wager: ${player.finalJeopardyWager || 0}</span>
                  <span>Answer: {player.finalJeopardyAnswer || 'No answer'}</span>
                  <span className={`font-bold ${player.score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Final Score: ${player.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

