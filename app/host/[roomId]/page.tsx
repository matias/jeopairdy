'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';
import { GameState, ServerMessage, Player } from '@/shared/types';
import GameBoard from '@/components/GameBoard/GameBoard';
import ClueDisplay from '@/components/ClueDisplay/ClueDisplay';
import Scoreboard from '@/components/Scoreboard/Scoreboard';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

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
  const buzzerOrder = gameState.buzzerOrder.map(id => playersMap.get(id)).filter(Boolean) as Player[];

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

  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-4xl font-bold">Host Control - Room {roomId}</h1>
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
            <ClueDisplay gameState={gameState} showAnswer={showAnswer} />
            
            <div className="mt-4 flex gap-4">
              {!showAnswer && (
                <button
                  onClick={handleRevealAnswer}
                  className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Reveal Answer
                </button>
              )}
              <button
                onClick={handleReturnToBoard}
                className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Back to Board
              </button>
            </div>
          </div>
        )}

        {gameState.status === 'judging' && currentPlayer && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
            <h2 className="text-2xl font-bold mb-4">Judging Answer</h2>
            <div className="mb-4">
              <p className="text-lg">
                <span className="font-bold">{currentPlayer.name}</span> answered
              </p>
              <p className="text-sm text-gray-600">
                Buzzed in at: {new Date(currentPlayer.buzzedAt || 0).toLocaleTimeString()}
              </p>
            </div>
            
            <div className="flex gap-4 mb-4">
              <button
                onClick={() => handleJudgeAnswer(currentPlayer.id, true)}
                className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Correct
              </button>
              <button
                onClick={() => handleJudgeAnswer(currentPlayer.id, false)}
                className="px-6 py-3 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Incorrect
              </button>
            </div>

            {buzzerOrder.length > 1 && (
              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-2">Buzzer order:</p>
                <ol className="list-decimal list-inside">
                  {buzzerOrder.map((player, index) => (
                    <li key={player.id} className={index === 0 ? 'font-bold' : ''}>
                      {player.name}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {gameState.status === 'judging' && !currentPlayer && (
          <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
            <p className="mb-4">No one buzzed in. The clue goes unanswered.</p>
            <button
              onClick={handleReturnToBoard}
              className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Back to Board
            </button>
          </div>
        )}

        <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
          <h2 className="text-2xl font-bold mb-4">Manual Score Adjustment</h2>
          <div className="grid grid-cols-2 gap-4">
            {players.map((player) => (
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
          {gameState.currentRound !== 'finalJeopardy' && (
            <button
              onClick={handleNextRound}
              className="px-6 py-3 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              Next Round
            </button>
          )}
          
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

