'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { WebSocketClient } from '@/lib/websocket';
import { getWebSocketUrl } from '@/lib/websocket-url';
import {
  getSystemInstructions,
  getInitialSamplePrompt,
  getRegenerationPrompt,
  getFullRoundPrompt,
  getFinalJeopardyPrompt,
} from '@/lib/prompts';
import type { SampleCategory, GameConfig, Category, RoundData, Round } from '@/shared/types';

const WS_URL = getWebSocketUrl();
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

type LoadingState = 'samples' | 'regenerate' | 'finalize' | null;

export default function CreateGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const roomId = searchParams?.get('roomId');

  const [topics, setTopics] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [sourceMaterial, setSourceMaterial] = useState('');
  const [feedback, setFeedback] = useState('');
  const [samples, setSamples] = useState<SampleCategory[] | null>(null);
  const [commentary, setCommentary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>(null);
  const [phase, setPhase] = useState<'setup' | 'iterating' | 'finalizing' | 'complete'>('setup');
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [finalGameId, setFinalGameId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    let mounted = true;
    const client = new WebSocketClient(WS_URL);

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

  const hasSamples = useMemo(() => Array.isArray(samples) && samples.length > 0, [samples]);

  if (!roomId) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div>No room ID provided</div>
      </main>
    );
  }

  const disabled = !topics.trim() || loadingState === 'samples' || loadingState === 'regenerate';

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
        conversationId: resetConversation ? null : conversationId,
        instructions: !conversationId || resetConversation ? instructions : undefined,
        message,
        format,
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
          : getRegenerationPrompt({ topics, difficulty, sourceMaterial, feedback });

      const outputText = await sendConversationMessage({
        message: prompt,
        resetConversation: mode === 'initial',
      });

      const parsed: SampleResponse = JSON.parse(outputText);
      setSamples(parsed.categories || []);
      setCommentary(parsed.commentary || '');
      setPhase('iterating');
    } catch (err: any) {
      console.error('[CreateGame] Sample generation failed', err);
      setError(err?.message || 'Failed to generate samples.');
    } finally {
      setLoadingState(null);
    }
  };

  const mapCategoriesToRound = (round: Round, rawCategories: SampleCategory[]): RoundData => {
    const categories: Category[] = rawCategories.map((cat, index) => ({
      id: `cat-${round}-${index}-${randomId()}`,
      name: cat.name ?? `Category ${index + 1}`,
      clues: (cat.clues || []).map((clue, clueIndex) => ({
        id: `clue-${round}-${index}-${clueIndex}-${randomId()}`,
        category: cat.name ?? `Category ${index + 1}`,
        value: Number(clue.value) || (round === 'doubleJeopardy' ? DOUBLE_VALUES : JEOPARDY_VALUES)[clueIndex] || 200,
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
    roundData.categories.flatMap((category) => category.clues.map((clue) => clue.answer));

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
    });

    const outputText = await sendConversationMessage({ message: prompt });
    return JSON.parse(outputText);
  };

  const sendGameToServer = (gameConfig: GameConfig) => {
    if (!wsClient) {
      throw new Error('Not connected to the game server.');
    }
    wsClient.loadGame(gameConfig);
    setFinalGameId(gameConfig.id);
    router.push(`/host/${roomId}`);
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
    setPhase('finalizing');
    setLoadingState('finalize');

    try {
      const jeopardyRound = await generateRound({
        round: 'jeopardy',
        values: JEOPARDY_VALUES,
      });
      const jeopardyAnswers = extractAnswers(jeopardyRound);

      const doubleRound = await generateRound({
        round: 'doubleJeopardy',
        values: DOUBLE_VALUES,
        excludedAnswers: jeopardyAnswers,
      });
      const allAnswers = [...jeopardyAnswers, ...extractAnswers(doubleRound)];

      const finalJeopardy = await generateFinalJeopardy(allAnswers);

      const gameConfig: GameConfig = {
        id: `game-${Date.now()}`,
        jeopardy: jeopardyRound,
        doubleJeopardy: doubleRound,
        finalJeopardy: {
          category: finalJeopardy.category,
          clue: finalJeopardy.clue,
          answer: finalJeopardy.answer,
        },
        createdAt: new Date().toISOString(),
      };

      sendGameToServer(gameConfig);
      setPhase('complete');
    } catch (err: any) {
      console.error('[CreateGame] Finalization failed', err);
      setError(err?.message || 'Failed to build the full game.');
      setPhase('iterating');
    } finally {
      setLoadingState(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col gap-8 px-6 py-10 lg:px-20">
      <div className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-gray-500">Room {roomId}</p>
        <h1 className="text-4xl font-bold">Co-create a Jeopardy! Game</h1>
        <p className="text-gray-600">
          Guide GPT-5.1 through an iterative process—preview categories, give feedback, and finalize when ready.
        </p>
        {connectionError && (
          <p className="text-sm text-red-600">
            {connectionError} The final game cannot be loaded until the connection is restored.
          </p>
        )}
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="topics" className="mb-2 block text-sm font-semibold text-gray-700">
              Topics / Prompt *
            </label>
            <textarea
              id="topics"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              className="h-32 w-full rounded border px-4 py-2 text-sm"
              placeholder="1990s pop culture, World War II leadership, Shakespeare deep cuts..."
            />
            <p className="mt-1 text-xs text-gray-500">Describe themes or constraints to ground the clues.</p>
          </div>

          <div>
            <label htmlFor="difficulty" className="mb-2 block text-sm font-semibold text-gray-700">
              Difficulty Level
            </label>
            <select
              id="difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="w-full rounded border px-4 py-2 text-sm"
            >
              <option value="easy">Easy – family friendly</option>
              <option value="medium">Medium – classic Jeopardy difficulty</option>
              <option value="hard">Hard – trivia diehards</option>
            </select>
          </div>

          <div>
            <label htmlFor="sourceMaterial" className="mb-2 block text-sm font-semibold text-gray-700">
              Source Material (optional)
            </label>
            <textarea
              id="sourceMaterial"
              value={sourceMaterial}
              onChange={(e) => setSourceMaterial(e.target.value)}
              className="h-32 w-full rounded border px-4 py-2 text-sm"
              placeholder="Paste excerpts, reference notes, or context the model should read first."
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleSampleGeneration('initial')}
              disabled={disabled}
              className="rounded bg-blue-600 px-5 py-2 text-white transition disabled:bg-gray-400"
            >
              {loadingState === 'samples' ? 'Generating samples…' : 'Generate Samples'}
            </button>
            <button
              onClick={() => router.push(`/host/${roomId}`)}
              className="rounded border border-gray-300 px-5 py-2 text-gray-700 transition hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Feedback & Controls</h2>
          <p className="text-sm text-gray-600">
            Each iteration overwrites the panel below. Leave targeted notes (e.g., “shift harder” or “add more science”).
          </p>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="h-36 w-full rounded border px-3 py-2 text-sm"
            placeholder="Example: Lean into 90s TV, fewer sports clues, and make 1000-point clues trickier."
          />
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleSampleGeneration('regenerate')}
              disabled={!hasSamples || !feedback.trim() || loadingState === 'regenerate'}
              className="rounded bg-purple-600 px-5 py-2 text-white transition disabled:bg-gray-400"
            >
              {loadingState === 'regenerate' ? 'Updating samples…' : 'Regenerate with Feedback'}
            </button>
            <button
              onClick={handleFinalize}
              disabled={!hasSamples || loadingState === 'finalize' || !!connectionError}
              className="rounded bg-green-600 px-5 py-2 text-white transition disabled:bg-gray-400"
            >
              {loadingState === 'finalize' ? 'Building full game…' : 'Finalize Game'}
            </button>
          </div>
          {finalGameId && (
            <p className="text-sm text-emerald-600">Game {finalGameId} ready—redirecting you to the host screen.</p>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {hasSamples && (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Sample Categories</h2>
              <p className="text-sm text-gray-600">Review the structure below, then keep iterating or finalize.</p>
            </div>
            <div className="rounded border border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-900 md:max-w-sm">
              {commentary || 'No commentary returned with this sample.'}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {samples!.map((category) => (
              <div key={category.name} className="flex flex-col gap-3 rounded-lg border border-gray-100 p-4 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900">{category.name}</h3>
                <div className="space-y-3">
                  {(category.clues || []).map((clue) => (
                    <div key={`${category.name}-${clue.value}-${clue.clue}`} className="rounded border border-gray-200 p-3">
                      <div className="text-xs font-semibold uppercase text-gray-500">Value {clue.value}</div>
                      <p className="mt-1 text-sm text-gray-800">{clue.clue}</p>
                      <p className="mt-2 text-xs font-mono text-green-700">{clue.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

