'use client';

import { GameState } from '@/shared/types';

interface ClueDisplayProps {
  gameState: GameState;
  showAnswer?: boolean;
}

export default function ClueDisplay({ gameState, showAnswer = false }: ClueDisplayProps) {
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

      {showAnswer && (
        <div className="mt-8 pt-8 border-t-4 border-yellow-400">
          <div className="text-5xl font-bold text-yellow-300 flex items-center justify-center text-center">
            {clue.answer}
          </div>
        </div>
      )}
    </div>
  );
}

