'use client';

import { GameState, Player } from '@/shared/types';

interface ClueDisplayProps {
  gameState: GameState;
  showAnswer?: boolean;
  buzzerOrder?: Player[];
  playersMap?: Map<string, Player>;
}

export default function ClueDisplay({ gameState, showAnswer = false, buzzerOrder, playersMap }: ClueDisplayProps) {
  if (!gameState.config || !gameState.selectedClue) {
    return null;
  }

  const round = gameState.currentRound === 'jeopardy' 
    ? gameState.config.jeopardy 
    : gameState.config.doubleJeopardy;

  const category = round.categories.find(c => c.id === gameState.selectedClue!.categoryId);
  const clue = category?.clues.find(c => c.id === gameState.selectedClue!.clueId);

  if (!clue) return null;

  return (
    <div className="w-full max-w-4xl mx-auto p-8 bg-blue-900 text-white rounded-lg border-4 border-white">
      <div className="mb-6 text-3xl font-bold text-yellow-300 uppercase tracking-wide">
        {category?.name} - ${clue.value.toLocaleString()}
      </div>
      
      <div className="text-5xl font-bold mb-8 min-h-[300px] flex items-center justify-center text-center leading-tight px-4">
        {clue.clue}
      </div>

      {/* Show who buzzed in (for host view) */}
      {buzzerOrder && buzzerOrder.length > 0 && (
        <div className="mt-4 pt-4 border-t-2 border-yellow-400">
          <div className="text-xl font-bold mb-2 text-yellow-300 uppercase">Buzzed In:</div>
          <div className="flex flex-wrap gap-2">
            {buzzerOrder.map((player, index) => (
              <span
                key={player.id}
                className={`px-3 py-1 rounded ${
                  index === 0
                    ? 'bg-yellow-400 text-blue-900 font-bold'
                    : 'bg-yellow-300 text-blue-900'
                }`}
              >
                {index + 1}. {player.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {showAnswer && (
        <div className="mt-8 pt-8 border-t-4 border-yellow-400">
          <div className="text-3xl font-bold mb-4 text-yellow-300 uppercase">Answer:</div>
          <div className="text-4xl font-bold text-yellow-300">
            {clue.answer}
          </div>
        </div>
      )}
    </div>
  );
}

