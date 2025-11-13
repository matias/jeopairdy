'use client';

import { useState, useEffect } from 'react';

interface BuzzerProps {
  locked: boolean;
  onBuzz: () => void;
  buzzed?: boolean;
}

export default function Buzzer({ locked, onBuzz, buzzed = false }: BuzzerProps) {
  const [pressed, setPressed] = useState(false);

  const handlePress = () => {
    if (!locked && !buzzed) {
      setPressed(true);
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
          ${locked || buzzed
            ? 'bg-gray-400 cursor-not-allowed'
            : pressed
            ? 'bg-red-600 scale-95 shadow-inner'
            : 'bg-red-500 hover:bg-red-600 active:scale-95 shadow-2xl'
          }
          text-white border-4 border-white
        `}
        onMouseDown={handlePress}
        onMouseUp={handleRelease}
        onMouseLeave={handleRelease}
        onTouchStart={handlePress}
        onTouchEnd={handleRelease}
        disabled={locked || buzzed}
      >
        {locked ? 'LOCKED' : buzzed ? 'BUZZED' : 'BUZZ IN'}
      </button>
      
      <div className="mt-4 text-lg">
        {locked && <p className="text-gray-600">Wait for the clue...</p>}
        {buzzed && <p className="text-green-600">You buzzed in!</p>}
        {!locked && !buzzed && <p className="text-blue-600">Ready to buzz</p>}
      </div>
    </div>
  );
}

