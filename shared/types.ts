// Game state types
export type Round = 'jeopardy' | 'doubleJeopardy' | 'finalJeopardy';

export interface ConversationMessage {
  role: 'user' | 'developer' | 'assistant';
  content: string;
}

export interface SampleClue {
  value: number;
  clue: string;
  answer: string;
}

export interface SampleCategory {
  name: string;
  clues: SampleClue[];
}

export type GameStatus =
  | 'waiting'
  | 'ready'
  | 'selecting'
  | 'clueRevealed'
  | 'buzzing'
  | 'answering'
  | 'judging'
  | 'finalJeopardyCategory'
  | 'finalJeopardyWagering'
  | 'finalJeopardyClueReading' // Host reads clue before timer starts
  | 'finalJeopardyAnswering'
  | 'finalJeopardyJudging'
  | 'finalJeopardyReveal'
  | 'finished';

export interface Clue {
  id: string;
  category: string;
  value: number;
  clue: string;
  answer: string;
  revealed: boolean;
  answered: boolean;
}

export interface Category {
  id: string;
  name: string;
  clues: Clue[];
}

export interface RoundData {
  round: Round;
  categories: Category[];
}

export interface GameConfig {
  id: string;
  jeopardy: RoundData;
  doubleJeopardy: RoundData;
  finalJeopardy: {
    category: string;
    clue: string;
    answer: string;
  };
  createdAt: string;
  metadata?: {
    topics: string;
    difficulty: string;
  };
}

export interface Player {
  id: string;
  name: string;
  score: number;
  buzzedAt?: number; // timestamp when buzzer was pressed
  finalJeopardyWager?: number;
  finalJeopardyAnswer?: string;
}

export interface GameState {
  roomId: string;
  config: GameConfig | null;
  status: GameStatus;
  currentRound: Round;
  selectedClue: { categoryId: string; clueId: string } | null;
  players: Map<string, Player>;
  buzzerOrder: string[]; // player IDs in order of buzz (all buzzes, including late ones)
  resolvedBuzzerOrder?: string[]; // Buzzer order with tie resolution: currentPlayer first, then others (updated as judging progresses)
  displayBuzzerOrder?: string[]; // Static display order: set once when tie is resolved, never changes (for UI)
  currentPlayer: string | null; // player who gets to answer (from tied buzzes only)
  judgedPlayers?: string[]; // player IDs that have been judged
  notPickedInTies?: string[]; // player IDs who haven't been picked in ties (for fairness)
  lastCorrectPlayer?: string | null; // player ID who last answered correctly (has control of board)
  buzzerUnlockTime?: number | null; // timestamp when buzzers were unlocked
  hostId: string;
  // Final Jeopardy state
  finalJeopardyInitialScores?: Map<string, number> | Record<string, number>; // snapshot of scores at Final Jeopardy start (Map on server, object when serialized)
  finalJeopardyJudgingOrder?: string[]; // player IDs sorted by initial scores (ascending)
  finalJeopardyClueShown?: boolean;
  finalJeopardyCountdownStart?: number;
  finalJeopardyCountdownEnd?: number;
  finalJeopardyJudgingPlayerIndex?: number;
  finalJeopardyRevealedWager?: boolean;
  finalJeopardyRevealedAnswer?: boolean;
}

// WebSocket message types
export type ClientMessage =
  | {
      type: 'joinRoom';
      roomId: string;
      playerName?: string;
      role: 'host' | 'player' | 'viewer';
      playerId?: string;
    }
  | { type: 'buzz'; timestamp: number }
  | { type: 'selectClue'; categoryId: string; clueId: string }
  | { type: 'revealAnswer' }
  | { type: 'judgeAnswer'; correct: boolean; playerId: string }
  | { type: 'updateScore'; playerId: string; delta: number }
  | { type: 'nextRound' }
  | { type: 'startFinalJeopardy' }
  | { type: 'submitWager'; wager: number }
  | { type: 'submitFinalAnswer'; answer: string }
  | { type: 'revealFinalAnswers' }
  | { type: 'showFinalJeopardyClue' }
  | { type: 'startFinalJeopardyJudging' }
  | { type: 'revealFinalJeopardyWager' }
  | { type: 'revealFinalJeopardyAnswer' }
  | { type: 'judgeFinalJeopardyAnswer'; playerId: string; correct: boolean }
  | {
      type: 'createGame';
      prompt: string;
      difficulty?: string;
      sourceMaterial?: string;
    }
  | { type: 'saveGame'; gameConfig: GameConfig }
  | { type: 'loadGame'; gameConfig: GameConfig }
  | { type: 'returnToBoard' }
  | { type: 'startGame' }
  | { type: 'ping'; timestamp: number };

export type ServerMessage =
  | {
      type: 'roomJoined';
      roomId: string;
      gameState: GameState;
      playerId: string;
    }
  | { type: 'gameStateUpdate'; gameState: GameState }
  | { type: 'buzzerLocked'; locked: boolean }
  | { type: 'buzzReceived'; playerId: string; timestamp: number }
  | { type: 'error'; message: string }
  | { type: 'gameCreated'; gameState: GameState }
  | { type: 'gameSaved'; gameId: string }
  | { type: 'pong'; timestamp: number };
