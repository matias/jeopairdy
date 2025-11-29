import { ServerMessage, GameConfig } from '@/shared/types';

/**
 * Interface for game clients using Firebase Firestore for real-time sync.
 */
export interface IGameClient {
  // Connection management
  connect(): Promise<void>;
  disconnect(): void;
  getConnected(): boolean;
  onConnectionStateChange(callback: (connected: boolean) => void): () => void;
  enableAutoReconnect(): void;
  disableAutoReconnect(): void;

  // Room management
  joinRoom(
    roomId: string | null,
    playerName: string | undefined,
    role: 'host' | 'player' | 'viewer',
    playerId?: string,
  ): void;
  getRoomId(): string | null;
  getPlayerId(): string | null;
  setPlayerId(playerId: string): void;

  // Game actions - Player
  buzz(): void;
  submitWager(wager: number): void;
  submitFinalAnswer(answer: string): void;

  // Game actions - Host
  selectClue(categoryId: string, clueId: string): void;
  unlockBuzzers(): void;
  revealAnswer(): void;
  judgeAnswer(correct: boolean, playerId: string): void;
  updateScore(playerId: string, delta: number): void;
  nextRound(): void;
  returnToBoard(): void;
  startGame(): void;

  // Game actions - Host (Final Jeopardy)
  startFinalJeopardy(): void;
  showFinalJeopardyClue(): void;
  startFinalJeopardyTimer(): void;
  startFinalJeopardyJudging(): void;
  revealFinalJeopardyWager(): void;
  revealFinalJeopardyAnswer(): void;
  revealFinalAnswers(): void;
  judgeFinalJeopardyAnswer(playerId: string, correct: boolean): void;

  // Game management - Host
  createGame(
    prompt: string,
    difficulty?: string,
    sourceMaterial?: string,
  ): void;
  saveGame(gameConfig: GameConfig): void;
  loadGame(gameConfig: GameConfig): void;

  // Event listeners
  on<T extends ServerMessage>(
    type: T['type'],
    callback: (message: T) => void,
  ): void;
  off<T extends ServerMessage>(
    type: T['type'],
    callback: (message: T) => void,
  ): void;
}
