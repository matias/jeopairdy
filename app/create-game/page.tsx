'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createGameClient } from '@/lib/game-client-factory';
import { IGameClient } from '@/lib/game-client-interface';
import {
  getSystemInstructions,
  getInitialSamplePrompt,
  getRegenerationPrompt,
  getFullRoundPrompt,
  getFinalJeopardyPrompt,
  getSingleClueRegenerationPrompt,
} from '@/lib/prompts';
import type {
  SampleCategory,
  GameConfig,
  Category,
  RoundData,
  Round,
} from '@/shared/types';
import { AuthHeader } from '@/components/AuthHeader';
const JEOPARDY_VALUES = [200, 400, 600, 800, 1000];
const DOUBLE_VALUES = [400, 800, 1200, 1600, 2000];

const randomId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

type SampleResponse = {
  commentary?: string;
  categories: SampleCategory[];
};

type LoadingState = 'samples' | 'regenerate' | 'finalize' | 'saving' | null;

function CreateGamePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams?.get('roomId');

  // Load persisted form data from localStorage on mount
  const getStorageKey = (key: string) => `create-game-${roomId}-${key}`;

  const loadPersistedFormData = (): {
    topics: string;
    difficulty: string;
    sourceMaterial: string;
  } | null => {
    if (!roomId || typeof window === 'undefined') return null;
    try {
      const stored = localStorage.getItem(getStorageKey('formData'));
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (err) {
      console.error('[CreateGame] Failed to load persisted form data', err);
    }
    return null;
  };

  const persistFormData = (data: {
    topics: string;
    difficulty: string;
    sourceMaterial: string;
  }) => {
    if (!roomId || typeof window === 'undefined') return;
    try {
      localStorage.setItem(getStorageKey('formData'), JSON.stringify(data));
    } catch (err) {
      console.error('[CreateGame] Failed to persist form data', err);
    }
  };

  // Use lazy initializer to load persisted data only once
  const [topics, setTopics] = useState(() => {
    const persisted = loadPersistedFormData();
    return persisted?.topics || '';
  });
  const [difficulty, setDifficulty] = useState(() => {
    const persisted = loadPersistedFormData();
    return persisted?.difficulty || 'medium';
  });
  const [sourceMaterial, setSourceMaterial] = useState(() => {
    const persisted = loadPersistedFormData();
    return persisted?.sourceMaterial || '';
  });
  const [feedback, setFeedback] = useState('');
  const [feedbackHistory, setFeedbackHistory] = useState<string[]>([]);
  const [samples, setSamples] = useState<SampleCategory[] | null>(null);
  const [commentary, setCommentary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>(null);
  const [phase, setPhase] = useState<
    'setup' | 'iterating' | 'finalizing' | 'editing' | 'complete'
  >('setup');
  const [wsClient, setWsClient] = useState<IGameClient | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [finalGameId, setFinalGameId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [showInitialForm, setShowInitialForm] = useState(true);
  const [currentRound, setCurrentRound] = useState<Round>('jeopardy');
  const [editingClue, setEditingClue] = useState<{
    clueId: string;
    field: 'clue' | 'answer';
  } | null>(null);
  const [regeneratingClueId, setRegeneratingClueId] = useState<string | null>(
    null,
  );
  const [model, setModel] = useState<'chatgpt-5.1' | 'gemini-3-pro'>(
    'gemini-3-pro',
  );
  const [useGoogleSearchGrounding, setUseGoogleSearchGrounding] =
    useState(false);
  const [finalizingRound, setFinalizingRound] = useState<
    'jeopardy' | 'doubleJeopardy' | 'finalJeopardy' | null
  >(null);
  const [failedRound, setFailedRound] = useState<
    'jeopardy' | 'doubleJeopardy' | 'finalJeopardy' | null
  >(null);

  // Load persisted data when roomId changes
  useEffect(() => {
    if (roomId) {
      const persisted = loadPersistedFormData();
      if (persisted) {
        setTopics(persisted.topics);
        setDifficulty(persisted.difficulty);
        setSourceMaterial(persisted.sourceMaterial);
      }
    }
  }, [roomId]);

  // Persist form data whenever it changes
  useEffect(() => {
    if (roomId) {
      persistFormData({ topics, difficulty, sourceMaterial });
    }
  }, [topics, difficulty, sourceMaterial, roomId]);

  useEffect(() => {
    if (!roomId) return;
    let mounted = true;
    const client = createGameClient();

    (async () => {
      try {
        await client.connect();
        client.joinRoom(roomId, undefined, 'host');
        if (mounted) {
          setWsClient(client);
        }
      } catch (err) {
        console.error('[CreateGame] Failed to connect to game server', err);
        if (mounted) {
          setConnectionError('Failed to connect to game server.');
        }
      }
    })();

    return () => {
      mounted = false;
      client.disconnect();
    };
  }, [roomId]);

  const hasSamples = useMemo(
    () => Array.isArray(samples) && samples.length > 0,
    [samples],
  );

  if (!roomId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-blue-900">
        <div className="text-white">No room ID provided</div>
      </main>
    );
  }

  const disabled =
    !topics.trim() ||
    loadingState === 'samples' ||
    loadingState === 'regenerate';

  const instructions = getSystemInstructions();

  const sendConversationMessage = async ({
    message,
    format = 'json_object',
    resetConversation = false,
  }: {
    message: string;
    format?: 'json_object' | 'text';
    resetConversation?: boolean;
  }) => {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        conversationId: resetConversation ? null : conversationId,
        // Always include instructions in case the server lost the conversation
        // (e.g., serverless cold start, conversation expiration)
        instructions,
        message,
        format,
        useGoogleSearchGrounding:
          model === 'gemini-3-pro' ? useGoogleSearchGrounding : false,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'The model request failed.');
    }

    const data = await response.json();
    if ((!conversationId || resetConversation) && data.conversationId) {
      setConversationId(data.conversationId);
    }
    return data.output_text as string;
  };

  const handleSampleGeneration = async (mode: 'initial' | 'regenerate') => {
    if (!topics.trim()) {
      setError('Please describe at least one topic or theme.');
      return;
    }

    setError(null);
    setLoadingState(mode === 'initial' ? 'samples' : 'regenerate');

    try {
      const prompt =
        mode === 'initial'
          ? getInitialSamplePrompt({ topics, difficulty, sourceMaterial })
          : getRegenerationPrompt({
              topics,
              difficulty,
              sourceMaterial,
              feedback,
            });

      const outputText = await sendConversationMessage({
        message: prompt,
        resetConversation: mode === 'initial',
      });

      const parsed: SampleResponse = JSON.parse(outputText);
      setSamples(parsed.categories || []);
      setCommentary(parsed.commentary || '');
      setPhase('iterating');
      setShowInitialForm(false);

      // Store feedback in history if this was a regeneration
      if (mode === 'regenerate' && feedback.trim()) {
        setFeedbackHistory((prev) => [...prev, feedback.trim()]);
      }
    } catch (err: any) {
      console.error('[CreateGame] Sample generation failed', err);
      setError(err?.message || 'Failed to generate samples.');
    } finally {
      setLoadingState(null);
    }
  };

  const mapCategoriesToRound = (
    round: Round,
    rawCategories: SampleCategory[],
  ): RoundData => {
    const categories: Category[] = rawCategories.map((cat, index) => ({
      id: `cat-${round}-${index}-${randomId()}`,
      name: cat.name ?? `Category ${index + 1}`,
      clues: (cat.clues || []).map((clue, clueIndex) => ({
        id: `clue-${round}-${index}-${clueIndex}-${randomId()}`,
        category: cat.name ?? `Category ${index + 1}`,
        value:
          Number(clue.value) ||
          (round === 'doubleJeopardy' ? DOUBLE_VALUES : JEOPARDY_VALUES)[
            clueIndex
          ] ||
          200,
        clue: clue.clue ?? '',
        answer: clue.answer ?? '',
        revealed: false,
        answered: false,
      })),
    }));

    return {
      round,
      categories,
    };
  };

  const extractAnswers = (roundData: RoundData) =>
    roundData.categories.flatMap((category) =>
      category.clues.map((clue) => clue.answer),
    );

  const generateRound = async ({
    round,
    values,
    excludedAnswers,
  }: {
    round: Round;
    values: number[];
    excludedAnswers?: string[];
  }) => {
    const prompt = getFullRoundPrompt({
      topics,
      difficulty,
      sourceMaterial,
      round,
      values,
      excludedAnswers,
      feedbackHistory,
    });
    const outputText = await sendConversationMessage({ message: prompt });
    const parsed = JSON.parse(outputText);
    return mapCategoriesToRound(round, parsed.categories || []);
  };

  const generateFinalJeopardy = async (excludedAnswers: string[]) => {
    const prompt = getFinalJeopardyPrompt({
      topics,
      difficulty,
      sourceMaterial,
      excludedAnswers,
      feedbackHistory,
    });

    const outputText = await sendConversationMessage({ message: prompt });
    return JSON.parse(outputText);
  };

  const handleEditClue = (
    clueId: string,
    field: 'clue' | 'answer',
    newValue: string,
  ) => {
    if (!gameConfig) return;

    const updateClueInRound = (roundData: RoundData): RoundData => {
      const updatedCategories = roundData.categories.map((category) => ({
        ...category,
        clues: category.clues.map((clue) =>
          clue.id === clueId ? { ...clue, [field]: newValue } : clue,
        ),
      }));
      return { ...roundData, categories: updatedCategories };
    };

    const updatedConfig: GameConfig = {
      ...gameConfig,
      jeopardy:
        gameConfig.jeopardy.round === 'jeopardy'
          ? updateClueInRound(gameConfig.jeopardy)
          : gameConfig.jeopardy,
      doubleJeopardy:
        gameConfig.doubleJeopardy.round === 'doubleJeopardy'
          ? updateClueInRound(gameConfig.doubleJeopardy)
          : gameConfig.doubleJeopardy,
      finalJeopardy:
        clueId === 'final-jeopardy'
          ? { ...gameConfig.finalJeopardy, [field]: newValue }
          : gameConfig.finalJeopardy,
    };

    setGameConfig(updatedConfig);
    setEditingClue(null);
  };

  const handleRegenerateClue = async (categoryId: string, clueId: string) => {
    if (!gameConfig || !conversationId) {
      setError('Game config or conversation not available.');
      return;
    }

    setRegeneratingClueId(clueId);
    setError(null);

    try {
      // Find the clue in the game config
      let foundClue: {
        clue: string;
        answer: string;
        value: number;
        category: string;
      } | null = null;
      let foundRound: Round | null = null;

      for (const roundData of [
        gameConfig.jeopardy,
        gameConfig.doubleJeopardy,
      ]) {
        for (const category of roundData.categories) {
          if (category.id === categoryId) {
            const clue = category.clues.find((c) => c.id === clueId);
            if (clue) {
              foundClue = clue;
              foundRound = roundData.round;
              break;
            }
          }
        }
        if (foundClue) break;
      }

      // Check Final Jeopardy
      if (
        !foundClue &&
        (clueId === 'final-jeopardy' || clueId === 'final-jeopardy-answer')
      ) {
        foundClue = {
          clue: gameConfig.finalJeopardy.clue,
          answer: gameConfig.finalJeopardy.answer,
          value: 0,
          category: gameConfig.finalJeopardy.category,
        };
        foundRound = 'finalJeopardy';
      }

      if (!foundClue || !foundRound) {
        throw new Error('Clue not found');
      }

      const prompt = getSingleClueRegenerationPrompt({
        topics,
        difficulty,
        sourceMaterial,
        categoryName: foundClue.category,
        round: foundRound,
        value: foundClue.value,
        currentClue: foundClue.clue,
        currentAnswer: foundClue.answer,
      });

      const outputText = await sendConversationMessage({ message: prompt });
      const parsed = JSON.parse(outputText);

      // Update the clue in game config
      if (foundRound === 'finalJeopardy') {
        setGameConfig({
          ...gameConfig,
          finalJeopardy: {
            ...gameConfig.finalJeopardy,
            clue: parsed.clue,
            answer: parsed.answer,
          },
        });
        // Clear regenerating state for both final jeopardy clue IDs
        if (clueId === 'final-jeopardy' || clueId === 'final-jeopardy-answer') {
          setRegeneratingClueId(null);
        }
      } else {
        const updateClueInRound = (roundData: RoundData): RoundData => {
          const updatedCategories = roundData.categories.map((category) => ({
            ...category,
            clues:
              category.id === categoryId
                ? category.clues.map((clue) =>
                    clue.id === clueId
                      ? { ...clue, clue: parsed.clue, answer: parsed.answer }
                      : clue,
                  )
                : category.clues,
          }));
          return { ...roundData, categories: updatedCategories };
        };

        setGameConfig({
          ...gameConfig,
          jeopardy:
            gameConfig.jeopardy.round === foundRound
              ? updateClueInRound(gameConfig.jeopardy)
              : gameConfig.jeopardy,
          doubleJeopardy:
            gameConfig.doubleJeopardy.round === foundRound
              ? updateClueInRound(gameConfig.doubleJeopardy)
              : gameConfig.doubleJeopardy,
        });
      }
    } catch (err: any) {
      console.error('[CreateGame] Clue regeneration failed', err);
      setError(err?.message || 'Failed to regenerate clue.');
    } finally {
      setRegeneratingClueId(null);
    }
  };

  const handleSaveGame = async () => {
    if (!wsClient || !gameConfig) {
      setError('Not connected to game server or no game to save.');
      return;
    }

    setError(null);
    setLoadingState('saving');

    try {
      // Set up listener for gameSaved response
      const savedPromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          wsClient.off('gameSaved', handler);
          wsClient.off('error', errorHandler);
          reject(new Error('Save timeout - please try again'));
        }, 10000);

        const handler = (message: any) => {
          clearTimeout(timeout);
          wsClient.off('gameSaved', handler);
          wsClient.off('error', errorHandler);
          resolve();
        };

        const errorHandler = (message: any) => {
          if (message.message && message.message.includes('save')) {
            clearTimeout(timeout);
            wsClient.off('gameSaved', handler);
            wsClient.off('error', errorHandler);
            reject(new Error(message.message));
          }
        };

        wsClient.on('gameSaved', handler);
        wsClient.on('error', errorHandler);
      });

      // Save game to file
      wsClient.saveGame(gameConfig);
      await savedPromise;

      // Load game into game manager
      wsClient.loadGame(gameConfig);
      setFinalGameId(gameConfig.id);
      setPhase('complete');
      router.push(`/host/${roomId}`);
    } catch (err: any) {
      console.error('[CreateGame] Save failed', err);
      setError(err?.message || 'Failed to save game.');
      setLoadingState(null);
    }
  };

  const processGameGeneration = async (initialConfig: GameConfig) => {
    let currentConfig = initialConfig;
    let currentStep: 'jeopardy' | 'doubleJeopardy' | 'finalJeopardy' =
      'jeopardy';

    try {
      // 1. Jeopardy
      if (currentConfig.jeopardy.categories.length === 0) {
        currentStep = 'jeopardy';
        setFinalizingRound('jeopardy');
        const jeopardyRound = await generateRound({
          round: 'jeopardy',
          values: JEOPARDY_VALUES,
        });

        currentConfig = {
          ...currentConfig,
          jeopardy: jeopardyRound,
        };
        setGameConfig(currentConfig);
      }

      // 2. Double Jeopardy
      if (currentConfig.doubleJeopardy.categories.length === 0) {
        currentStep = 'doubleJeopardy';
        setFinalizingRound('doubleJeopardy');
        const jeopardyAnswers = extractAnswers(currentConfig.jeopardy);
        const doubleRound = await generateRound({
          round: 'doubleJeopardy',
          values: DOUBLE_VALUES,
          excludedAnswers: jeopardyAnswers,
        });

        currentConfig = {
          ...currentConfig,
          doubleJeopardy: doubleRound,
        };
        setGameConfig(currentConfig);
      }

      // 3. Final Jeopardy
      if (!currentConfig.finalJeopardy.category) {
        currentStep = 'finalJeopardy';
        setFinalizingRound('finalJeopardy');
        const allAnswers = [
          ...extractAnswers(currentConfig.jeopardy),
          ...extractAnswers(currentConfig.doubleJeopardy),
        ];
        const finalJeopardy = await generateFinalJeopardy(allAnswers);

        currentConfig = {
          ...currentConfig,
          finalJeopardy: {
            category: finalJeopardy.category,
            clue: finalJeopardy.clue,
            answer: finalJeopardy.answer,
          },
        };
        setGameConfig(currentConfig);
      }

      setFinalizingRound(null);
    } catch (err: any) {
      console.error(`[CreateGame] Finalization failed at ${currentStep}`, err);
      setError(err?.message || 'Failed to generate round.');
      setFailedRound(currentStep);
      setFinalizingRound(null);
    } finally {
      setLoadingState(null);
    }
  };

  const handleRetry = async () => {
    if (!gameConfig) return;
    setError(null);
    setFailedRound(null);
    setLoadingState('finalize');
    await processGameGeneration(gameConfig);
  };

  const handleFinalize = async () => {
    if (!topics.trim()) {
      setError('Topics are required before finalizing.');
      return;
    }

    if (!wsClient) {
      setError('Waiting for game server connection...');
      return;
    }

    setError(null);
    setFailedRound(null);
    setPhase('editing');
    setLoadingState('finalize');

    // Initialize game config with empty rounds that will be filled progressively
    const initialGameConfig: GameConfig = {
      id: `game-${Date.now()}`,
      jeopardy: {
        round: 'jeopardy',
        categories: [],
      },
      doubleJeopardy: {
        round: 'doubleJeopardy',
        categories: [],
      },
      finalJeopardy: {
        category: '',
        clue: '',
        answer: '',
      },
      createdAt: new Date().toISOString(),
      metadata: {
        topics,
        difficulty,
      },
    };
    setGameConfig(initialGameConfig);

    await processGameGeneration(initialGameConfig);
  };

  // Render editing phase
  if (phase === 'editing' && gameConfig) {
    const currentRoundData =
      currentRound === 'jeopardy'
        ? gameConfig.jeopardy
        : currentRound === 'doubleJeopardy'
          ? gameConfig.doubleJeopardy
          : null;
    const isRegenerating = (clueId: string) => regeneratingClueId === clueId;
    const isEditing = (clueId: string, field: 'clue' | 'answer') =>
      editingClue?.clueId === clueId && editingClue?.field === field;

    const getRoundStatus = (
      round: 'jeopardy' | 'doubleJeopardy' | 'finalJeopardy',
    ) => {
      if (failedRound === round) return 'error';
      if (!finalizingRound) return null;
      if (finalizingRound === round) {
        return 'generating';
      }
      // Check if this round is waiting for a previous round
      if (round === 'doubleJeopardy' && finalizingRound === 'jeopardy') {
        return 'waiting';
      }
      if (
        round === 'finalJeopardy' &&
        (finalizingRound === 'jeopardy' || finalizingRound === 'doubleJeopardy')
      ) {
        return 'waiting';
      }
      return null;
    };

    return (
      <main className="flex min-h-screen flex-col gap-8 px-6 py-10 lg:px-20 bg-blue-900">
        <AuthHeader />
        <div className="flex flex-col gap-2">
          <p className="text-sm uppercase tracking-wide text-gray-300">
            Room {roomId}
          </p>
          <h1 className="jeopardy-title text-4xl font-bold text-white uppercase tracking-wider">
            Edit Your Jeopardy! Game
          </h1>
          <p className="text-gray-300">
            Review and edit clues, then save when ready.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setCurrentRound('jeopardy')}
            disabled={getRoundStatus('jeopardy') === 'generating'}
            className={`rounded px-4 py-2 text-sm font-medium transition ${
              currentRound === 'jeopardy'
                ? 'bg-gray-600 text-white'
                : 'bg-blue-800 text-white hover:bg-blue-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Jeopardy
            {getRoundStatus('jeopardy') === 'generating' && ' (Generating...)'}
          </button>
          <button
            onClick={() => setCurrentRound('doubleJeopardy')}
            disabled={getRoundStatus('doubleJeopardy') === 'generating'}
            className={`rounded px-4 py-2 text-sm font-medium transition ${
              currentRound === 'doubleJeopardy'
                ? 'bg-gray-600 text-white'
                : 'bg-blue-800 text-white hover:bg-blue-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Double Jeopardy
            {getRoundStatus('doubleJeopardy') === 'generating' &&
              ' (Generating...)'}
          </button>
          <button
            onClick={() => setCurrentRound('finalJeopardy')}
            disabled={getRoundStatus('finalJeopardy') === 'generating'}
            className={`rounded px-4 py-2 text-sm font-medium transition ${
              currentRound === 'finalJeopardy'
                ? 'bg-gray-600 text-white'
                : 'bg-blue-800 text-white hover:bg-blue-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            Final Jeopardy
            {getRoundStatus('finalJeopardy') === 'generating' &&
              ' (Generating...)'}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleSaveGame}
            disabled={
              loadingState === 'saving' ||
              !!connectionError ||
              !!finalizingRound ||
              !gameConfig.jeopardy.categories.length ||
              !gameConfig.doubleJeopardy.categories.length ||
              !gameConfig.finalJeopardy.category
            }
            className="rounded bg-gray-600 px-6 py-2 text-white hover:bg-gray-700 transition disabled:bg-gray-400"
          >
            {loadingState === 'saving' ? 'Saving…' : 'SAVE GAME'}
          </button>
        </div>

        {error && (
          <div className="rounded border border-red-400 bg-red-900/50 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {currentRound === 'finalJeopardy' ? (
          <section className="rounded-2xl border border-blue-700 bg-blue-800 p-6 shadow-sm">
            {getRoundStatus('finalJeopardy') === 'error' ? (
              <div className="py-8 text-center">
                <p className="mb-4 text-lg text-red-500">
                  Failed to generate Final Jeopardy.
                </p>
                <button
                  onClick={handleRetry}
                  className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700 transition-colors"
                >
                  Retry Generation
                </button>
              </div>
            ) : getRoundStatus('finalJeopardy') === 'generating' ? (
              <div className="py-8 text-center">
                <p className="text-lg text-gray-300">
                  Generating game... please wait
                </p>
              </div>
            ) : getRoundStatus('finalJeopardy') === 'waiting' ? (
              <div className="py-8 text-center">
                <p className="text-lg text-gray-300">
                  Waiting for previous stage to generate game... please wait
                </p>
              </div>
            ) : !gameConfig.finalJeopardy.category ? (
              <div className="py-8 text-center">
                <p className="text-lg text-gray-300">
                  Waiting for previous stage to generate game... please wait
                </p>
              </div>
            ) : (
              <>
                <h2 className="mb-4 text-2xl font-semibold text-white">
                  {gameConfig.finalJeopardy.category}
                </h2>
                <div className="group relative rounded-lg border border-blue-600 bg-blue-900 p-4">
                  {isEditing('final-jeopardy', 'clue') ? (
                    <textarea
                      defaultValue={gameConfig.finalJeopardy.clue}
                      onBlur={(e) =>
                        handleEditClue('final-jeopardy', 'clue', e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.currentTarget.blur();
                        } else if (e.key === 'Escape') {
                          setEditingClue(null);
                        }
                      }}
                      className="w-full rounded border border-blue-600 bg-blue-800 text-white px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
                      autoFocus
                    />
                  ) : (
                    <>
                      <div className="absolute right-2 top-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() =>
                            setEditingClue({
                              clueId: 'final-jeopardy',
                              field: 'clue',
                            })
                          }
                          className="rounded bg-blue-700 p-1.5 hover:bg-blue-600 text-white"
                          title="Edit clue"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() =>
                            handleRegenerateClue('', 'final-jeopardy')
                          }
                          disabled={isRegenerating('final-jeopardy')}
                          className="rounded bg-blue-700 p-1.5 hover:bg-blue-600 text-white disabled:opacity-50"
                          title="Regenerate clue"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        </button>
                      </div>
                      <p className="text-sm text-white">
                        {gameConfig.finalJeopardy.clue}
                      </p>
                    </>
                  )}
                </div>
                <div className="group relative mt-4 rounded-lg border border-blue-600 bg-blue-900 p-4">
                  {isEditing('final-jeopardy', 'answer') ? (
                    <textarea
                      defaultValue={gameConfig.finalJeopardy.answer}
                      onBlur={(e) =>
                        handleEditClue(
                          'final-jeopardy',
                          'answer',
                          e.target.value,
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.currentTarget.blur();
                        } else if (e.key === 'Escape') {
                          setEditingClue(null);
                        }
                      }}
                      className="w-full rounded border border-blue-600 bg-blue-800 text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-yellow-400"
                      autoFocus
                    />
                  ) : (
                    <>
                      <div className="absolute right-2 top-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() =>
                            setEditingClue({
                              clueId: 'final-jeopardy',
                              field: 'answer',
                            })
                          }
                          className="rounded bg-blue-700 p-1.5 hover:bg-blue-600 text-white"
                          title="Edit answer"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() =>
                            handleRegenerateClue('', 'final-jeopardy-answer')
                          }
                          disabled={isRegenerating('final-jeopardy-answer')}
                          className="rounded bg-blue-700 p-1.5 hover:bg-blue-600 text-white disabled:opacity-50"
                          title="Regenerate answer"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        </button>
                      </div>
                      <p className="text-xs font-mono text-green-300">
                        {gameConfig.finalJeopardy.answer}
                      </p>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        ) : currentRoundData ? (
          <section className="rounded-2xl border border-blue-700 bg-blue-800 p-6 shadow-sm">
            {getRoundStatus(currentRound) === 'error' ? (
              <div className="py-8 text-center">
                <p className="mb-4 text-lg text-red-500">
                  Failed to generate{' '}
                  {currentRound === 'jeopardy' ? 'Jeopardy' : 'Double Jeopardy'}{' '}
                  Round.
                </p>
                <button
                  onClick={handleRetry}
                  className="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700 transition-colors"
                >
                  Retry Generation
                </button>
              </div>
            ) : getRoundStatus(currentRound) === 'generating' ? (
              <div className="py-8 text-center">
                <p className="text-lg text-gray-300">
                  Generating game... please wait
                </p>
              </div>
            ) : getRoundStatus(currentRound) === 'waiting' ? (
              <div className="py-8 text-center">
                <p className="text-lg text-gray-300">
                  Waiting for previous stage to generate game... please wait
                </p>
              </div>
            ) : !currentRoundData || !currentRoundData.categories.length ? (
              <div className="py-8 text-center">
                <p className="text-lg text-gray-300">
                  Waiting for previous stage to generate game... please wait
                </p>
              </div>
            ) : (
              <>
                <h2 className="mb-6 text-2xl font-semibold text-white">
                  {currentRound === 'jeopardy' ? 'Jeopardy' : 'Double Jeopardy'}{' '}
                  Round
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                  {currentRoundData &&
                    currentRoundData.categories.map((category) => (
                      <div
                        key={category.id}
                        className="flex flex-col gap-3 rounded-lg border border-blue-600 bg-blue-900 p-4 shadow-sm"
                      >
                        <h3 className="text-lg font-semibold text-white">
                          {category.name}
                        </h3>
                        <div className="space-y-3">
                          {category.clues
                            .sort((a, b) => a.value - b.value)
                            .map((clue) => (
                              <div
                                key={clue.id}
                                className="group relative rounded border border-blue-600 bg-blue-800 p-3 hover:border-yellow-400"
                              >
                                {isRegenerating(clue.id) ? (
                                  <div className="text-sm text-gray-300">
                                    Regenerating...
                                  </div>
                                ) : (
                                  <>
                                    <div className="absolute right-2 top-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                      <button
                                        onClick={() =>
                                          setEditingClue({
                                            clueId: clue.id,
                                            field: 'clue',
                                          })
                                        }
                                        className="rounded bg-blue-700 p-1.5 hover:bg-blue-600 text-white"
                                        title="Edit clue"
                                      >
                                        <svg
                                          className="h-4 w-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                          />
                                        </svg>
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleRegenerateClue(
                                            category.id,
                                            clue.id,
                                          )
                                        }
                                        disabled={isRegenerating(clue.id)}
                                        className="rounded bg-blue-700 p-1.5 hover:bg-blue-600 text-white disabled:opacity-50"
                                        title="Regenerate clue"
                                      >
                                        <svg
                                          className="h-4 w-4"
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                          />
                                        </svg>
                                      </button>
                                    </div>
                                    <div className="text-xs font-semibold uppercase text-gray-300">
                                      Value {clue.value}
                                    </div>
                                    {isEditing(clue.id, 'clue') ? (
                                      <textarea
                                        defaultValue={clue.clue}
                                        onBlur={(e) =>
                                          handleEditClue(
                                            clue.id,
                                            'clue',
                                            e.target.value,
                                          )
                                        }
                                        onKeyDown={(e) => {
                                          if (
                                            e.key === 'Enter' &&
                                            !e.shiftKey
                                          ) {
                                            e.currentTarget.blur();
                                          } else if (e.key === 'Escape') {
                                            setEditingClue(null);
                                          }
                                        }}
                                        className="mt-1 w-full rounded border border-blue-600 bg-blue-900 text-white px-2 py-1 text-sm focus:outline-none focus:border-yellow-400"
                                        autoFocus
                                      />
                                    ) : (
                                      <p className="mt-1 text-sm text-white">
                                        {clue.clue}
                                      </p>
                                    )}
                                    <div className="relative mt-2">
                                      {isEditing(clue.id, 'answer') ? (
                                        <textarea
                                          defaultValue={clue.answer}
                                          onBlur={(e) =>
                                            handleEditClue(
                                              clue.id,
                                              'answer',
                                              e.target.value,
                                            )
                                          }
                                          onKeyDown={(e) => {
                                            if (
                                              e.key === 'Enter' &&
                                              !e.shiftKey
                                            ) {
                                              e.currentTarget.blur();
                                            } else if (e.key === 'Escape') {
                                              setEditingClue(null);
                                            }
                                          }}
                                          className="w-full rounded border px-2 py-1 text-xs font-mono"
                                          autoFocus
                                        />
                                      ) : (
                                        <>
                                          <div className="absolute right-0 top-0 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                            <button
                                              onClick={() =>
                                                setEditingClue({
                                                  clueId: clue.id,
                                                  field: 'answer',
                                                })
                                              }
                                              className="rounded bg-blue-700 p-1 hover:bg-blue-600 text-white"
                                              title="Edit answer"
                                            >
                                              <svg
                                                className="h-3 w-3"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                              >
                                                <path
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                  strokeWidth={2}
                                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                                />
                                              </svg>
                                            </button>
                                          </div>
                                          <p className="cursor-pointer text-xs font-mono text-green-300">
                                            {clue.answer}
                                          </p>
                                        </>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    ))}
                </div>
              </>
            )}
          </section>
        ) : null}
      </main>
    );
  }

  // Render sample/iteration phase
  return (
    <main className="flex min-h-screen flex-col gap-8 px-6 py-10 lg:px-20 bg-blue-900">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-gray-300">
          Room {roomId}
        </p>
        <h1 className="jeopardy-title text-4xl font-bold text-white uppercase tracking-wider">
          Co-create a Jeopardy! Game
        </h1>
        <p className="text-gray-300">
          Guide an AI model through an iterative process—preview categories,
          give feedback, and finalize when ready.
        </p>
        {connectionError && (
          <p className="text-sm text-red-500">
            {connectionError} The final game cannot be loaded until the
            connection is restored.
          </p>
        )}
      </div>

      {hasSamples && phase !== 'editing' && loadingState !== 'finalize' && (
        <section className="rounded-2xl border border-blue-700 bg-blue-800 p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">
                Sample Categories
              </h2>
              <p className="text-sm text-gray-300">
                Review the structure below, then keep iterating or finalize.
              </p>
            </div>
            <div className="rounded border border-blue-600 bg-blue-900 px-4 py-2 text-sm text-gray-300 md:max-w-sm">
              {commentary || 'No commentary returned with this sample.'}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {samples!.map((category) => (
              <div
                key={category.name}
                className="flex flex-col gap-3 rounded-lg border border-blue-600 bg-blue-900 p-4 shadow-sm"
              >
                <h3 className="text-lg font-semibold text-white">
                  {category.name}
                </h3>
                <div className="space-y-3">
                  {(category.clues || []).map((clue) => (
                    <div
                      key={`${category.name}-${clue.value}-${clue.clue}`}
                      className="rounded border border-blue-600 bg-blue-800 p-3"
                    >
                      <div className="text-xs font-semibold uppercase text-gray-300">
                        Value {clue.value}
                      </div>
                      <p className="mt-1 text-sm text-white">{clue.clue}</p>
                      <p className="mt-2 text-xs font-mono text-green-300">
                        {clue.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1fr_auto]">
        {showInitialForm && (
          <div className="space-y-6 rounded-xl border border-blue-700 bg-blue-800 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Game Setup</h2>
              {hasSamples && (
                <button
                  onClick={() => setShowInitialForm(false)}
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Hide
                </button>
              )}
            </div>
            <div>
              <label
                htmlFor="topics"
                className="mb-2 block text-sm font-semibold text-white"
              >
                Topics / Prompt *
              </label>
              <textarea
                id="topics"
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                className="h-32 w-full rounded border border-blue-600 bg-blue-900 text-white placeholder-gray-400 px-4 py-2 text-sm focus:outline-none focus:border-yellow-400"
                placeholder="1990s pop culture, World War II leadership, Shakespeare deep cuts..."
              />
              <p className="mt-1 text-xs text-gray-300">
                Describe themes or constraints to ground the clues.
              </p>
            </div>

            <div>
              <label
                htmlFor="difficulty"
                className="mb-2 block text-sm font-semibold text-white"
              >
                Difficulty Level
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full rounded border border-blue-600 bg-blue-900 text-white px-4 py-2 text-sm focus:outline-none focus:border-yellow-400"
              >
                <option value="easy">Easy – family friendly</option>
                <option value="medium">
                  Medium – classic Jeopardy difficulty
                </option>
                <option value="hard">Hard – trivia diehards</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="sourceMaterial"
                className="mb-2 block text-sm font-semibold text-white"
              >
                Source Material (optional)
              </label>
              <textarea
                id="sourceMaterial"
                value={sourceMaterial}
                onChange={(e) => setSourceMaterial(e.target.value)}
                className="h-32 w-full rounded border border-blue-600 bg-blue-900 text-white placeholder-gray-400 px-4 py-2 text-sm focus:outline-none focus:border-yellow-400"
                placeholder="Paste excerpts, reference notes, or context the model should read first."
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-white">
                AI Model
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="model"
                    value="chatgpt-5.1"
                    checked={model === 'chatgpt-5.1'}
                    onChange={(e) => {
                      setModel('chatgpt-5.1');
                      setUseGoogleSearchGrounding(false);
                      setConversationId(null);
                    }}
                    className="cursor-pointer"
                  />
                  <span className="text-sm text-white">ChatGPT 5.1</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="model"
                    value="gemini-3-pro"
                    checked={model === 'gemini-3-pro'}
                    onChange={(e) => {
                      setModel('gemini-3-pro');
                      setConversationId(null);
                    }}
                    className="cursor-pointer"
                  />
                  <span className="text-sm text-white">Gemini 3.0 Pro</span>
                </label>
              </div>
            </div>

            {model === 'gemini-3-pro' && (
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useGoogleSearchGrounding}
                    onChange={(e) =>
                      setUseGoogleSearchGrounding(e.target.checked)
                    }
                    className="cursor-pointer"
                  />
                  <span className="text-sm text-white">
                    Enable Google Search Grounding
                  </span>
                </label>
                <p className="mt-1 text-xs text-gray-300">
                  Allow Gemini to search the web for real-time information when
                  generating clues.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleSampleGeneration('initial')}
                disabled={disabled}
                className="rounded bg-gray-600 px-5 py-2 text-white hover:bg-gray-700 transition disabled:bg-gray-400"
              >
                {loadingState === 'samples'
                  ? 'Generating samples…'
                  : 'Generate Samples'}
              </button>
              <button
                onClick={() => router.push(`/host/${roomId}`)}
                className="rounded border border-blue-600 bg-blue-800 px-5 py-2 text-white hover:bg-blue-700 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {hasSamples && phase !== 'editing' && loadingState !== 'finalize' && (
          <div className="space-y-4 rounded-xl border border-blue-700 bg-blue-800 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-white">
              Feedback & Controls
            </h2>
            <p className="text-sm text-gray-300">
              Each iteration overwrites the panel above. Leave targeted notes
              (e.g., "shift harder" or "add more science").
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="h-36 w-full rounded border border-blue-600 bg-blue-900 text-white placeholder-gray-400 px-3 py-2 text-sm focus:outline-none focus:border-yellow-400"
              placeholder="Example: Lean into 90s TV, fewer sports clues, and make 1000-point clues trickier."
            />
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleSampleGeneration('regenerate')}
                disabled={
                  !hasSamples ||
                  !feedback.trim() ||
                  loadingState === 'regenerate'
                }
                className="rounded bg-gray-600 px-5 py-2 text-white hover:bg-gray-700 transition disabled:bg-gray-400"
              >
                {loadingState === 'regenerate'
                  ? 'Updating samples…'
                  : 'Regenerate with Feedback'}
              </button>
              <button
                onClick={handleFinalize}
                disabled={!hasSamples || !!connectionError}
                className="rounded bg-gray-600 px-5 py-2 text-white hover:bg-gray-700 transition disabled:bg-gray-400"
              >
                Finalize Game
              </button>
            </div>
            {finalGameId && (
              <p className="text-sm text-green-300">
                Game {finalGameId} ready—redirecting you to the host screen.
              </p>
            )}
          </div>
        )}

        {!showInitialForm && hasSamples && (
          <button
            onClick={() => setShowInitialForm(true)}
            className="h-fit rounded-lg border border-blue-600 bg-blue-800 p-3 text-left shadow-sm hover:bg-blue-700 transition-colors"
          >
            <div className="text-xs font-semibold text-white">
              Show Game Setup
            </div>
            <div className="mt-0.5 text-[10px] text-gray-300">
              Edit topics, difficulty, or source material
            </div>
          </button>
        )}
      </section>

      {error && (
        <div className="rounded border border-red-400 bg-red-900/50 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </main>
  );
}

export default function CreateGamePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col gap-8 px-6 py-10 lg:px-20 bg-blue-900">
          <h1 className="jeopardy-title text-3xl font-bold tracking-tight text-white uppercase">
            Create New Game
          </h1>
          <div className="text-white">Loading...</div>
        </main>
      }
    >
      <CreateGamePageContent />
    </Suspense>
  );
}
