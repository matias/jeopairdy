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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedPlayers.map((player) => (
          <div
            key={player.id}
            className={`
              p-4 rounded-lg border-2
              ${highlightPlayer === player.id 
                ? 'border-yellow-400 bg-yellow-100' 
                : 'border-gray-300 bg-white'
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
        ))}
      </div>
    </div>
  );
}

