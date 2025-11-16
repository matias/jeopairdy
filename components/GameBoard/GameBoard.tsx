'use client';

import { GameState, Category, Clue } from '@/shared/types';

interface GameBoardProps {
  gameState: GameState;
  onSelectClue?: (categoryId: string, clueId: string) => void;
  showValues?: boolean;
  readOnly?: boolean;
  visibleClues?: Set<string>; // Set of clue keys (categoryId_clueId) that should be visible during animation
}

const VALUES = [200, 400, 600, 800, 1000];
const DOUBLE_VALUES = [400, 800, 1200, 1600, 2000];

export default function GameBoard({ gameState, onSelectClue, showValues = true, readOnly = false, visibleClues }: GameBoardProps) {
  if (!gameState.config) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-xl">No game loaded</p>
      </div>
    );
  }

  const round = gameState.currentRound === 'jeopardy' 
    ? gameState.config.jeopardy 
    : gameState.config.doubleJeopardy;

  const values = gameState.currentRound === 'jeopardy' ? VALUES : DOUBLE_VALUES;

  const handleClueClick = (categoryId: string, clueId: string) => {
    if (onSelectClue) {
      const category = round.categories.find(c => c.id === categoryId);
      const clue = category?.clues.find(c => c.id === clueId);
      if (clue && !clue.revealed) {
        onSelectClue(categoryId, clueId);
      }
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <table className="w-full border-collapse border-4 border-white">
        <thead>
          <tr>
            {round.categories.map((category) => (
              <th
                key={category.id}
                className="jeopardy-category p-4 text-center text-lg border-2 border-white"
                style={{ width: `${100 / round.categories.length}%` }}
              >
                <div className="h-20 flex items-center justify-center px-2">
                  <span className="category-text uppercase leading-tight">{category.name}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {values.map((value, rowIndex) => (
            <tr key={rowIndex}>
              {round.categories.map((category) => {
                const clue = category.clues[rowIndex];
                const isRevealed = clue?.revealed || false;
                const isSelected = gameState.selectedClue?.categoryId === category.id &&
                  gameState.selectedClue?.clueId === clue?.id;
                
                // During animation, only show clues that are in visibleClues set
                const clueKey = `${category.id}_${clue?.id}`;
                const isVisible = visibleClues === undefined || visibleClues.has(clueKey);

                return (
                  <td
                    key={`${category.id}-${rowIndex}`}
                      className={`
                        jeopardy-clue p-2 text-center border-2 border-white
                        ${isRevealed
                          ? 'revealed bg-gray-600 text-gray-400 cursor-not-allowed'
                          : readOnly
                          ? 'cursor-default'
                          : 'cursor-pointer hover:bg-blue-800'
                        }
                        ${isSelected ? 'ring-4 ring-yellow-400 ring-offset-2' : ''}
                        ${!isVisible ? 'opacity-0' : ''}
                      `}
                      onClick={() => !readOnly && clue && !isRevealed && handleClueClick(category.id, clue.id)}
                  >
                    <div className="h-20 flex items-center justify-center font-bold">
                      {isRevealed ? '' : showValues && isVisible ? <span className="value-text">${value.toLocaleString()}</span> : ''}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

