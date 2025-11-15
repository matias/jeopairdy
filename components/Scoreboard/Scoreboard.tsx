'use client';

import { GameState, Player } from '@/shared/types';

interface ScoreboardProps {
  gameState: GameState;
  highlightPlayer?: string;
}

export default function Scoreboard({ gameState, highlightPlayer }: ScoreboardProps) {
  // Convert players array to array for easier access
  const players = Array.isArray(gameState.players)
    ? gameState.players
    : Array.from(gameState.players.values());
  const sortedPlayers = players.sort((a, b) => b.score - a.score);

  return (
    <div className="w-full">
      <div 
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${sortedPlayers.length}, minmax(0, 1fr))` }}
      >
        {sortedPlayers.map((player) => {
          const isLastCorrect = gameState.lastCorrectPlayer === player.id;
          const isHighlighted = highlightPlayer === player.id || isLastCorrect;
          return (
          <div
            key={player.id}
            className={`
              p-4 rounded-lg
              ${isLastCorrect 
                ? 'border-4 border-yellow-500 bg-yellow-100' 
                : isHighlighted
                ? 'border-2 border-yellow-400 bg-yellow-100'
                : 'border-2 border-gray-300 bg-white'
              }
            `}
          >
            <div className="text-lg font-bold">{player.name}</div>
            <div className={`
              text-2xl font-bold mt-2
              ${player.score >= 0 ? 'text-green-600' : 'text-red-600'}
            `}>
              ${player.score.toLocaleString()}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

