'use client';

import { useState, useEffect } from 'react';

interface BuzzerProps {
  locked: boolean;
  onBuzz: () => void;
  onEarlyBuzz: () => void;
  buzzed?: boolean;
  showTooSoonMessage?: boolean;
}

export default function Buzzer({
  locked,
  onBuzz,
  onEarlyBuzz,
  buzzed = false,
  showTooSoonMessage = false,
}: BuzzerProps) {
  const [pressed, setPressed] = useState(false);

  const handlePress = () => {
    if (buzzed) return; // Don't allow pressing if already buzzed

    setPressed(true);

    if (locked) {
      // Early buzz - notify parent
      onEarlyBuzz();
    } else {
      // Normal buzz
      onBuzz();
    }
  };

  const handleRelease = () => {
    setPressed(false);
  };

  useEffect(() => {
    if (buzzed) {
      setPressed(false);
    }
  }, [buzzed]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <button
        className={`
          w-64 h-64 rounded-full text-4xl font-bold uppercase tracking-wide
          transition-all duration-150
          ${
            buzzed
              ? 'bg-gray-400 cursor-not-allowed'
              : pressed
                ? 'bg-red-600 scale-95 shadow-inner'
                : locked
                  ? 'bg-yellow-500 hover:bg-yellow-600 active:scale-95 shadow-2xl'
                  : 'bg-red-500 hover:bg-red-600 active:scale-95 shadow-2xl'
          }
          text-white border-4 border-white
        `}
        onMouseDown={handlePress}
        onMouseUp={handleRelease}
        onMouseLeave={handleRelease}
        onTouchStart={handlePress}
        onTouchEnd={handleRelease}
        disabled={buzzed}
      >
        {buzzed ? 'BUZZED' : locked ? 'WAIT' : 'BUZZ IN!'}
      </button>

      <div className="mt-4 text-lg min-h-[28px]">
        {showTooSoonMessage && (
          <p className="text-red-600 font-bold animate-pulse">Too soon!</p>
        )}
        {!showTooSoonMessage && locked && (
          <p className="text-gray-600">Wait for the clue...</p>
        )}
        {!showTooSoonMessage && buzzed && (
          <p className="text-green-600">You buzzed in!</p>
        )}
        {!showTooSoonMessage && !locked && !buzzed && (
          <p className="text-blue-600">Ready to buzz</p>
        )}
      </div>
    </div>
  );
}
