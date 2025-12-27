'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import { createGameClient } from '@/lib/game-client-factory';
import { IGameClient } from '@/lib/game-client-interface';
import { GameState, ServerMessage } from '@/shared/types';
import GameBoard from '@/components/GameBoard/GameBoard';
import ClueDisplay from '@/components/ClueDisplay/ClueDisplay';
import Scoreboard from '@/components/Scoreboard/Scoreboard';
import { JeopardyTitle } from '@/components/JeopardyTitle';

import {
  playBoardFill,
  playIntroMusic,
  stopIntroMusic,
  fadeOutIntroMusic,
  playTimesUp,
  playThinkMusic,
  stopThinkMusic,
} from '@/lib/audio';
const ANSWER_TIMEOUT = 20000; // 20 seconds

// Check if current date is Dec 24 or 25 in US/Eastern timezone
function isChristmasTime(): boolean {
  if (typeof window === 'undefined') return false;
  
  const now = new Date();
  // Convert to US/Eastern timezone
  const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const month = easternTime.getMonth() + 1; // getMonth() returns 0-11
  const date = easternTime.getDate();
  
  return month === 12 && (date === 24 || date === 25);
}

// Snowflake component for falling snow effect
function Snowflake({ left, delay, duration }: { left: string; delay: number; duration: number }) {
  return (
    <div
      className="absolute text-white text-2xl pointer-events-none select-none"
      style={{
        left: `${left}%`,
        animation: `snowfall ${duration}s linear ${delay}s infinite`,
        top: '-50px',
      }}
    >
      ❄
    </div>
  );
}

// Christmas emoji component
function ChristmasEmoji({ emoji, left, top }: { emoji: string; left: string; top: string }) {
  return (
    <div
      className="absolute text-4xl pointer-events-none select-none animate-bounce"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        animationDuration: '3s',
        animationDelay: `${Math.random() * 2}s`,
      }}
    >
      {emoji}
    </div>
  );
}

// Snow effect overlay component
function SnowEffect() {
  const snowflakes = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 5,
    duration: 5 + Math.random() * 5, // 5-10 seconds
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-10">
      {snowflakes.map((flake) => (
        <Snowflake
          key={flake.id}
          left={flake.left.toString()}
          delay={flake.delay}
          duration={flake.duration}
        />
      ))}
    </div>
  );
}

// Christmas emojis overlay component (positioned to avoid QR code area)
function ChristmasEmojis() {
  const emojis = ['🎄', '🎁', '🎅', '❄️', '☃️', '🦌', '🔔', '🌟', '⭐', '✨'];
  const positions = Array.from({ length: 20 }, () => ({
    emoji: emojis[Math.floor(Math.random() * emojis.length)],
    left: Math.random() * 100,
    top: Math.random() * 100,
  }));

  // Filter out positions that would overlap with QR code area (roughly center of screen)
  // QR code is roughly centered, so avoid positions between 30-70% horizontally and 35-65% vertically
  const filteredPositions = positions.filter(
    (pos) =>
      !(pos.left > 30 && pos.left < 70 && pos.top > 35 && pos.top < 65)
  );

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-10">
      {filteredPositions.map((pos, i) => (
        <ChristmasEmoji
          key={i}
          emoji={pos.emoji}
          left={pos.left.toString()}
          top={pos.top.toString()}
        />
      ))}
    </div>
  );
}

function CountdownTimer({
  countdownEnd,
}: {
  countdownEnd: number | undefined;
}) {
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!countdownEnd) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((countdownEnd - now) / 1000));
      setTimeLeft(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [countdownEnd]);

  if (timeLeft === null || timeLeft === 0) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  return (
    <div className="fixed bottom-4 right-4 bg-red-600 text-white px-6 py-4 rounded-lg text-4xl font-bold z-50">
      {minutes > 0 ? (
        <>
          {minutes}:{String(seconds).padStart(2, '0')}
        </>
      ) : (
        <>:{String(seconds).padStart(2, '0')}</>
      )}
    </div>
  );
}

export default function GameDisplayPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const [gameClient, setGameClient] = useState<IGameClient | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [showScores, setShowScores] = useState(true);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [visibleClues, setVisibleClues] = useState<Set<string> | null>(null); // null = animation complete, show all
  const [prevStatus, setPrevStatus] = useState<GameState['status'] | null>(
    null,
  );
  const [isTransitioning, setIsTransitioning] = useState(false); // Track transition from ready to selecting
  const gameStateRef = useRef<GameState | null>(null);
  const lastSelectedClueRef = useRef<{
    categoryId: string;
    clueId: string;
  } | null>(null);
  const answerTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Keep ref in sync with gameState
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    const client = createGameClient();
    client
      .connect()
      .then(() => {
        client.joinRoom(roomId, undefined, 'viewer'); // Join as viewer to receive updates without being added as a player

        client.on('roomJoined', (message: any) => {
          setGameState(message.gameState);
          // Generate QR code if game is ready
          if (
            message.gameState.status === 'ready' &&
            typeof window !== 'undefined'
          ) {
            const joinUrl = `${window.location.origin}/join?room=${roomId}`;
            QRCode.toDataURL(joinUrl).then((url) => {
              setQrCodeUrl(url);
            });
          }
        });

        client.on('gameStateUpdate', (message: any) => {
          setGameState((prev) => {
            setPrevStatus(prev?.status || null);
            return message.gameState;
          });
          // Update QR code if status changes to ready
          if (
            message.gameState.status === 'ready' &&
            typeof window !== 'undefined'
          ) {
            const joinUrl = `${window.location.origin}/join?room=${roomId}`;
            QRCode.toDataURL(joinUrl).then((url) => {
              setQrCodeUrl(url);
            });
          }
        });

        setGameClient(client);
      })
      .catch(console.error);

    return () => {
      client.disconnect();
    };
  }, [roomId]);

  // Handle transition from 'ready' to 'selecting' with fade out and delay
  useEffect(() => {
    if (!gameState || !gameState.config) return;

    // Only trigger transition when moving from 'ready' to 'selecting'
    if (prevStatus === 'ready' && gameState.status === 'selecting') {
      // Immediately hide all clues to prevent flash
      setVisibleClues(new Set());
      setIsTransitioning(true);

      const handleTransition = async () => {
        // Fade out intro music (2 seconds)
        await fadeOutIntroMusic(2000);

        // Wait remaining time to reach 5 seconds total
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Transition complete, proceed with board fill animation
        setIsTransitioning(false);

        const runBoardFillAnimation = async () => {
          const round =
            gameState.currentRound === 'jeopardy'
              ? gameState.config!.jeopardy
              : gameState.config!.doubleJeopardy;

          // Build list of all clue keys
          const clueMaskOrder: string[] = [];
          round.categories.forEach((category) => {
            category.clues.forEach((clue) => {
              clueMaskOrder.push(`${category.id}_${clue.id}`);
            });
          });

          // Clues are already hidden from transition start

          // Play the board fill sound
          playBoardFill();

          // Shuffle the clue order for random fill-in effect
          const shuffled = [...clueMaskOrder];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }

          // Split into sets of 5 clues
          const clueSets: string[][] = [];
          for (let i = 0; i < shuffled.length; i += 5) {
            clueSets.push(shuffled.slice(i, i + 5));
          }

          // Reveal clues in sets, with 400ms delay between sets
          for (let i = 0; i < clueSets.length; i++) {
            await new Promise((resolve) => setTimeout(resolve, 400));
            setVisibleClues((prev) => {
              const newSet = new Set(prev || []);
              clueSets[i].forEach((clueKey) => newSet.add(clueKey));
              return newSet;
            });
          }

          // Animation complete - show all clues
          await new Promise((resolve) => setTimeout(resolve, 200));
          setVisibleClues(null);
        };

        runBoardFillAnimation();
      };

      handleTransition();
    } else if (gameState.status !== 'selecting') {
      // Reset animation state when not in selecting mode
      setVisibleClues(null);
      setIsTransitioning(false);
    }
  }, [
    gameState?.status,
    prevStatus,
    gameState?.config,
    gameState?.currentRound,
  ]);

  // Play intro music based on game state (don't stop on transition, let fadeOut handle it)
  useEffect(() => {
    if (!gameState) return;

    if (gameState.status === 'ready' && !isTransitioning) {
      // Play intro music when in ready state (and not transitioning)
      playIntroMusic();
    }

    // Cleanup on unmount
    return () => {
      stopIntroMusic();
    };
  }, [gameState?.status, isTransitioning]);

  // Play think music during Final Jeopardy answering
  useEffect(() => {
    if (!gameState) return;

    if (gameState.status === 'finalJeopardyAnswering') {
      // Play think music when Final Jeopardy answering starts
      playThinkMusic();
    } else {
      // Stop think music when state changes away from Final Jeopardy answering
      stopThinkMusic();
    }

    // Cleanup on unmount
    return () => {
      stopThinkMusic();
    };
  }, [gameState?.status]);

  // Handle 20-second timeout for answering clues
  // Timer starts when buzzers are unlocked (status changes to 'buzzing')
  useEffect(() => {
    if (!gameState) return;

    const currentClue = gameState.selectedClue;

    // Clear any existing timeout when state moves away from buzzing
    if (
      gameState.status === 'selecting' ||
      gameState.status === 'ready' ||
      gameState.status === 'finished' ||
      gameState.status === 'clueRevealed'
    ) {
      if (answerTimeoutIdRef.current) {
        clearTimeout(answerTimeoutIdRef.current);
        answerTimeoutIdRef.current = null;
      }
      lastSelectedClueRef.current = null;
    }

    // Start timer when status changes to 'buzzing' (host unlocked buzzers)
    if (gameState.status === 'buzzing' && currentClue) {
      const clueChanged =
        !lastSelectedClueRef.current ||
        lastSelectedClueRef.current.categoryId !== currentClue.categoryId ||
        lastSelectedClueRef.current.clueId !== currentClue.clueId;

      if (clueChanged) {
        // Clear any existing timeout first
        if (answerTimeoutIdRef.current) {
          clearTimeout(answerTimeoutIdRef.current);
        }

        lastSelectedClueRef.current = currentClue;

        const timeoutId = setTimeout(() => {
          // Check current state (not closure) - only play if no one has buzzed
          // Play times-up only if status is still 'buzzing' (no buzzes yet)
          // Do NOT play if status is 'answering' or 'judging' (someone already buzzed)
          const currentState = gameStateRef.current;
          if (
            currentState &&
            currentState.selectedClue &&
            currentState.selectedClue.categoryId === currentClue.categoryId &&
            currentState.selectedClue.clueId === currentClue.clueId &&
            currentState.status === 'buzzing'
          ) {
            playTimesUp();
          }
          answerTimeoutIdRef.current = null;
        }, ANSWER_TIMEOUT);

        answerTimeoutIdRef.current = timeoutId;
      }
    }

    // Cleanup on unmount
    return () => {
      if (answerTimeoutIdRef.current) {
        clearTimeout(answerTimeoutIdRef.current);
      }
    };
  }, [gameState?.status, gameState?.selectedClue]);

  if (!gameState) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-blue-900">
        <div className="text-white text-2xl">Connecting...</div>
      </main>
    );
  }

  if (gameState.status === 'ready' || isTransitioning) {
    const showChristmas = isChristmasTime();
    
    return (
      <main className="flex min-h-screen items-center justify-center bg-blue-900 relative">
        {showChristmas && (
          <>
            <SnowEffect />
            <ChristmasEmojis />
          </>
        )}
        <div
          className={`max-w-4xl mx-auto text-center transition-opacity duration-[2000ms] relative z-20 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
        >
          <JeopardyTitle className="mb-8" />
          <div className="bg-blue-800 p-8 rounded-lg">
            <h2 className="text-4xl font-bold mb-6 text-white">
              Join the Game
            </h2>
            {qrCodeUrl ? (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="w-96 h-96 bg-white p-4 rounded relative z-30"
                />
                <p className="text-xl text-white">Scan to join Room {roomId}</p>
                {typeof window !== 'undefined' && (
                  <p className="text-lg text-blue-200">
                    Or visit: {window.location.origin}/join?room={roomId}
                  </p>
                )}
              </div>
            ) : (
              <div className="text-white">Generating QR code...</div>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-blue-900">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 text-center">
          <JeopardyTitle className="mb-2" />
          <div className="text-3xl text-white font-bold uppercase tracking-wide">
            {gameState.currentRound === 'jeopardy'
              ? 'FIRST ROUND'
              : gameState.currentRound === 'doubleJeopardy'
                ? 'DOUBLE JEOPARDY ROUND'
                : 'FINAL JEOPARDY'}
          </div>
        </div>

        {showScores && gameState.status === 'selecting' && (
          <div className="mb-6">
            <Scoreboard gameState={gameState} />
          </div>
        )}

        {gameState.status === 'selecting' && !isTransitioning && (
          <div className="mb-6">
            <GameBoard
              gameState={gameState}
              showValues={true}
              readOnly={true}
              visibleClues={visibleClues || undefined}
            />
          </div>
        )}

        {(gameState.status === 'clueRevealed' ||
          gameState.status === 'buzzing' ||
          gameState.status === 'answering' ||
          gameState.status === 'judging') && (
          <div className="mb-6">
            <ClueDisplay
              gameState={gameState}
              showAnswer={gameState.status === 'judging'}
            />
          </div>
        )}

        {gameState.status === 'finalJeopardyCategory' && gameState.config && (
          <div className="bg-blue-800 p-8 rounded-lg text-white text-center">
            <p className="text-7xl mb-4">
              <span className="category-text">
                {gameState.config.finalJeopardy.category}
              </span>
            </p>
            <p className="text-xl">Players are placing their wagers...</p>
          </div>
        )}

        {gameState.status === 'finalJeopardyWagering' && gameState.config && (
          <div className="bg-blue-800 p-8 rounded-lg text-white text-center">
            <p className="text-7xl mb-4">
              <span className="category-text">
                {gameState.config.finalJeopardy.category}
              </span>
            </p>
            <p className="text-xl">Players are placing their wagers...</p>
          </div>
        )}

        {gameState.status === 'finalJeopardyClueReading' &&
          gameState.config && (
            <div className="bg-blue-800 p-8 rounded-lg text-white">
              <div className="text-center mb-6">
                <p className="text-4xl mb-4">
                  <span className="category-text">
                    {gameState.config.finalJeopardy.category}
                  </span>
                </p>
                <p className="clue-text text-5xl font-bold mb-4">
                  {gameState.config.finalJeopardy.clue}
                </p>
              </div>
            </div>
          )}

        {gameState.status === 'finalJeopardyAnswering' && gameState.config && (
          <div className="bg-blue-800 p-8 rounded-lg text-white">
            <div className="text-center mb-6">
              <p className="text-4xl mb-4">
                <span className="category-text">
                  {gameState.config.finalJeopardy.category}
                </span>
              </p>
              <p className="clue-text text-5xl font-bold mb-4">
                {gameState.config.finalJeopardy.clue}
              </p>
            </div>
            <p className="text-xl text-center">
              Players are writing their answers...
            </p>
            <CountdownTimer
              countdownEnd={gameState.finalJeopardyCountdownEnd}
            />
          </div>
        )}

        {gameState.status === 'finalJeopardyJudging' && gameState.config && (
          <div className="bg-blue-800 p-8 rounded-lg text-white">
            <div className="text-center mb-6">
              <p className="text-7xl mb-4">
                <span className="category-text">
                  {gameState.config.finalJeopardy.category}
                </span>
              </p>
              <p className="clue-text text-3xl font-bold mb-4">
                {gameState.config.finalJeopardy.clue}
              </p>
            </div>
            {gameState.finalJeopardyJudgingOrder &&
              gameState.finalJeopardyJudgingPlayerIndex !== undefined && (
                <div className="text-center">
                  {(() => {
                    const currentPlayerId =
                      gameState.finalJeopardyJudgingOrder[
                        gameState.finalJeopardyJudgingPlayerIndex
                      ];
                    const currentPlayer = Array.from(
                      gameState.players.values(),
                    ).find((p) => p.id === currentPlayerId);
                    if (!currentPlayer) return null;

                    return (
                      <div className="bg-blue-900 p-6 rounded-lg">
                        <p className="text-2xl font-bold mb-4">
                          {currentPlayer.name}
                        </p>
                        {gameState.finalJeopardyRevealedWager && (
                          <p className="text-xl mb-2">
                            Wager:{' '}
                            <span className="scoreboard-points">
                              ${currentPlayer.finalJeopardyWager || 0}
                            </span>
                          </p>
                        )}
                        {gameState.finalJeopardyRevealedAnswer && (
                          <p className="text-xl">
                            Answer:{' '}
                            <span className="final-jeopardy-answer">
                              {currentPlayer.finalJeopardyAnswer || 'No answer'}
                            </span>
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
          </div>
        )}

        {gameState.status === 'finalJeopardyReveal' && gameState.config && (
          <div className="bg-blue-800 p-8 rounded-lg text-white">
            <div className="text-center mb-6">
              <p className="text-7xl mb-4">
                <span className="category-text">
                  {gameState.config.finalJeopardy.category}
                </span>
              </p>
              <p className="clue-text text-3xl font-bold mb-4">
                {gameState.config.finalJeopardy.clue}
              </p>
              {/* Answer is never shown on game display */}
            </div>
            <div className="mt-8">
              <Scoreboard gameState={gameState} />
            </div>
          </div>
        )}

        {gameState.status === 'finished' && (
          <div className="bg-blue-800 p-8 rounded-lg text-white text-center">
            <h2 className="text-4xl font-bold mb-4">THANK YOU FOR PLAYING!</h2>
            <div className="mt-8">
              <Scoreboard gameState={gameState} />
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => setShowScores(!showScores)}
            className="px-6 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            {showScores ? 'Hide' : 'Show'} Scores
          </button>
        </div>
      </div>
    </main>
  );
}
