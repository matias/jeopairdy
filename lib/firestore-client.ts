import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  addDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  query,
  orderBy,
  Timestamp,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import {
  getFirestoreDb,
  ensureAuth,
  getCurrentUserId,
  getCurrentUser,
  isFirebaseConfigured,
} from './firebase';
import { IGameClient } from './game-client-interface';
import { notifyRoomCreated } from './slack';
import {
  ServerMessage,
  GameConfig,
  GameState,
  Player,
  GameStatus,
  Round,
} from '@/shared/types';

// Constants
const TIE_WINDOW_MS = 250;
const BUZZER_PROCESS_DELAY_MS = 300; // Wait a bit longer than tie window

// Generate a 4-character room ID
function generateRoomId(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Calculate speaking time based on syllable count (same as server)
function syllableCount(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const vowels = word.match(/[aeiouy]{1,2}/g);
  return vowels ? vowels.length : 3;
}

function calculateSpeakingTime(clueText: string): number {
  if (!clueText) return 1000;
  const processedText = clueText
    .replace(/^\(.*\)/, '')
    .replace(/_+/g, ' blank ')
    .split(' ')
    .map((word) => syllableCount(word));
  const totalSyllables = processedText.reduce((a, b) => a + b, 0);
  let speakingTime = Math.max((totalSyllables / 4) * 1000, 2000);
  return Math.min(speakingTime, 10000);
}

interface BuzzRecord {
  playerId: string;
  clientTimestamp: number;
  serverTimestamp: Timestamp;
}

interface FirestoreGameState {
  status: GameStatus;
  currentRound: Round;
  selectedClue: { categoryId: string; clueId: string } | null;
  buzzerOrder: string[];
  resolvedBuzzerOrder: string[];
  displayBuzzerOrder: string[];
  currentPlayer: string | null;
  judgedPlayers: string[];
  notPickedInTies: string[];
  lastCorrectPlayer: string | null;
  buzzerLocked: boolean;
  buzzerUnlockTime?: number;
  // Final Jeopardy
  finalJeopardyInitialScores?: Record<string, number>;
  finalJeopardyJudgingOrder?: string[];
  finalJeopardyClueShown?: boolean;
  finalJeopardyCountdownStart?: number;
  finalJeopardyCountdownEnd?: number;
  finalJeopardyJudgingPlayerIndex?: number;
  finalJeopardyRevealedWager?: boolean;
  finalJeopardyRevealedAnswer?: boolean;
}

interface FirestoreMetadata {
  hostId: string;
  createdAt: Timestamp;
}

export class FirestoreClient implements IGameClient {
  private roomId: string | null = null;
  private playerId: string | null = null;
  private role: 'host' | 'player' | 'viewer' | null = null;
  private userId: string | null = null;
  private isConnectedState: boolean = false;
  private autoReconnectEnabled: boolean = true;

  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private connectionStateListeners: Set<(connected: boolean) => void> =
    new Set();

  // Firestore unsubscribe functions
  private unsubscribeState: Unsubscribe | null = null;
  private unsubscribePlayers: Unsubscribe | null = null;
  private unsubscribeBuzzes: Unsubscribe | null = null;
  private unsubscribeConfig: Unsubscribe | null = null;
  private unsubscribeMetadata: Unsubscribe | null = null;

  // Local state cache
  private gameState: GameState | null = null;
  private gameConfig: GameConfig | null = null;
  private metadata: FirestoreMetadata | null = null;
  private players: Map<string, Player> = new Map();
  private buzzes: BuzzRecord[] = [];

  // Buzzer processing
  private buzzerProcessTimeout: NodeJS.Timeout | null = null;

  async connect(): Promise<void> {
    if (!isFirebaseConfigured()) {
      throw new Error(
        'Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* environment variables.',
      );
    }

    try {
      this.userId = await ensureAuth();
      this.setConnected(true);
    } catch (error) {
      console.error('Failed to authenticate with Firebase:', error);
      throw error;
    }
  }

  disconnect(): void {
    this.cleanupSubscriptions();
    this.setConnected(false);
    this.listeners.clear();
    this.roomId = null;
    this.playerId = null;
    this.role = null;
    this.gameState = null;
    this.gameConfig = null;
    this.metadata = null;
    this.players.clear();
    this.buzzes = [];
  }

  private cleanupSubscriptions(): void {
    if (this.unsubscribeState) {
      this.unsubscribeState();
      this.unsubscribeState = null;
    }
    if (this.unsubscribePlayers) {
      this.unsubscribePlayers();
      this.unsubscribePlayers = null;
    }
    if (this.unsubscribeBuzzes) {
      this.unsubscribeBuzzes();
      this.unsubscribeBuzzes = null;
    }
    if (this.unsubscribeConfig) {
      this.unsubscribeConfig();
      this.unsubscribeConfig = null;
    }
    if (this.unsubscribeMetadata) {
      this.unsubscribeMetadata();
      this.unsubscribeMetadata = null;
    }
    if (this.buzzerProcessTimeout) {
      clearTimeout(this.buzzerProcessTimeout);
      this.buzzerProcessTimeout = null;
    }
  }

  getConnected(): boolean {
    return this.isConnectedState;
  }

  private setConnected(connected: boolean): void {
    this.isConnectedState = connected;
    this.connectionStateListeners.forEach((cb) => cb(connected));
  }

  onConnectionStateChange(callback: (connected: boolean) => void): () => void {
    this.connectionStateListeners.add(callback);
    return () => {
      this.connectionStateListeners.delete(callback);
    };
  }

  enableAutoReconnect(): void {
    this.autoReconnectEnabled = true;
  }

  disableAutoReconnect(): void {
    this.autoReconnectEnabled = false;
  }

  getRoomId(): string | null {
    return this.roomId;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  setPlayerId(playerId: string): void {
    this.playerId = playerId;
  }

  // Event handling
  on<T extends ServerMessage>(
    type: T['type'],
    callback: (message: T) => void,
  ): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
  }

  off<T extends ServerMessage>(
    type: T['type'],
    callback: (message: T) => void,
  ): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit(type: string, data: any): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach((cb) => cb(data));
    }
  }

  // Room management
  async joinRoom(
    roomId: string | null,
    playerName: string | undefined,
    role: 'host' | 'player' | 'viewer',
    existingPlayerId?: string,
  ): Promise<void> {
    const db = getFirestoreDb();
    this.role = role;

    if (role === 'host') {
      // Host creates or joins room
      let actualRoomId = roomId;
      if (!actualRoomId) {
        // Generate unique room ID
        do {
          actualRoomId = generateRoomId();
          const existingRoom = await getDoc(
            doc(db, 'games', actualRoomId, 'metadata', 'info'),
          );
          if (existingRoom.exists()) {
            actualRoomId = null;
          }
        } while (!actualRoomId);
      }

      this.roomId = actualRoomId;
      this.playerId = this.userId!;

      // Check if room already exists
      const metadataRef = doc(db, 'games', actualRoomId, 'metadata', 'info');
      const existingMetadata = await getDoc(metadataRef);

      if (!existingMetadata.exists()) {
        // Create new room
        await setDoc(metadataRef, {
          hostId: this.userId,
          createdAt: serverTimestamp(),
        });

        // Initialize game state
        await setDoc(doc(db, 'games', actualRoomId, 'state', 'current'), {
          status: 'waiting',
          currentRound: 'jeopardy',
          selectedClue: null,
          buzzerOrder: [],
          resolvedBuzzerOrder: [],
          displayBuzzerOrder: [],
          currentPlayer: null,
          judgedPlayers: [],
          notPickedInTies: [],
          lastCorrectPlayer: null,
          buzzerLocked: true,
        } as FirestoreGameState);

        // Notify Slack about new room creation
        notifyRoomCreated({
          roomId: actualRoomId,
          hostId: this.userId!,
          clientType: 'firestore',
        });
      }

      this.setupSubscriptions(actualRoomId);
    } else if (role === 'player') {
      // Player joins existing room
      if (!roomId) {
        this.emit('error', { type: 'error', message: 'Room ID required' });
        return;
      }

      this.roomId = roomId;

      // Check if room exists
      const metadataRef = doc(db, 'games', roomId, 'metadata', 'info');
      const metadataSnap = await getDoc(metadataRef);
      if (!metadataSnap.exists()) {
        this.emit('error', { type: 'error', message: 'Room not found' });
        return;
      }

      // Use existing player ID or generate new one
      this.playerId = existingPlayerId || this.userId!;

      // Check if reconnecting
      const playerRef = doc(db, 'games', roomId, 'players', this.playerId);
      const existingPlayer = await getDoc(playerRef);

      if (!existingPlayer.exists()) {
        // New player - create player document
        const name = playerName || `Player ${Math.floor(Math.random() * 1000)}`;
        await setDoc(playerRef, {
          id: this.playerId,
          name,
          score: 0,
        });
      }

      this.setupSubscriptions(roomId);
    } else {
      // Viewer
      if (!roomId) {
        this.emit('error', { type: 'error', message: 'Room ID required' });
        return;
      }

      this.roomId = roomId;

      // Check if room exists
      const metadataRef = doc(db, 'games', roomId, 'metadata', 'info');
      const metadataSnap = await getDoc(metadataRef);
      if (!metadataSnap.exists()) {
        this.emit('error', { type: 'error', message: 'Room not found' });
        return;
      }

      this.setupSubscriptions(roomId);
    }
  }

  private setupSubscriptions(roomId: string): void {
    const db = getFirestoreDb();

    // Subscribe to metadata
    this.unsubscribeMetadata = onSnapshot(
      doc(db, 'games', roomId, 'metadata', 'info'),
      (snap) => {
        if (snap.exists()) {
          this.metadata = snap.data() as FirestoreMetadata;
        }
      },
    );

    // Subscribe to game config
    this.unsubscribeConfig = onSnapshot(
      doc(db, 'games', roomId, 'config', 'current'),
      (snap) => {
        if (snap.exists()) {
          this.gameConfig = snap.data() as GameConfig;
          this.emitGameStateUpdate();
        }
      },
    );

    // Subscribe to game state
    this.unsubscribeState = onSnapshot(
      doc(db, 'games', roomId, 'state', 'current'),
      (snap) => {
        if (snap.exists()) {
          const stateData = snap.data() as FirestoreGameState;
          this.updateLocalGameState(stateData);
          this.emitGameStateUpdate();

          // Emit buzzerLocked event
          this.emit('buzzerLocked', {
            type: 'buzzerLocked',
            locked: stateData.buzzerLocked,
          });
        }
      },
    );

    // Subscribe to players
    this.unsubscribePlayers = onSnapshot(
      collection(db, 'games', roomId, 'players'),
      (snap) => {
        this.players.clear();
        snap.forEach((doc) => {
          const player = doc.data() as Player;
          this.players.set(doc.id, player);
        });
        this.emitGameStateUpdate();

        // If this is initial join, emit roomJoined
        if (!this.gameState) {
          this.emitRoomJoined();
        }
      },
    );

    // Subscribe to buzzes (for host to process)
    this.unsubscribeBuzzes = onSnapshot(
      query(
        collection(db, 'games', roomId, 'buzzes'),
        orderBy('serverTimestamp'),
      ),
      (snap) => {
        this.buzzes = [];
        snap.forEach((doc) => {
          const buzz = doc.data() as BuzzRecord;
          this.buzzes.push(buzz);
        });

        // If host, process buzzes
        if (this.role === 'host' && this.buzzes.length > 0) {
          this.processBuzzes();
        }

        // Emit buzz received for UI updates
        if (snap.docChanges().length > 0) {
          const latestChange = snap
            .docChanges()
            .find((c) => c.type === 'added');
          if (latestChange) {
            const buzz = latestChange.doc.data() as BuzzRecord;
            this.emit('buzzReceived', {
              type: 'buzzReceived',
              playerId: buzz.playerId,
              timestamp: buzz.clientTimestamp,
            });
          }
        }
      },
    );

    // Emit initial roomJoined after subscriptions are set up
    setTimeout(() => this.emitRoomJoined(), 100);
  }

  private updateLocalGameState(stateData: FirestoreGameState): void {
    this.gameState = {
      roomId: this.roomId!,
      config: this.gameConfig,
      status: stateData.status,
      currentRound: stateData.currentRound,
      selectedClue: stateData.selectedClue,
      players: this.players,
      buzzerOrder: stateData.buzzerOrder || [],
      resolvedBuzzerOrder: stateData.resolvedBuzzerOrder || [],
      displayBuzzerOrder: stateData.displayBuzzerOrder || [],
      currentPlayer: stateData.currentPlayer,
      judgedPlayers: stateData.judgedPlayers || [],
      notPickedInTies: stateData.notPickedInTies || [],
      lastCorrectPlayer: stateData.lastCorrectPlayer,
      hostId: this.metadata?.hostId || '',
      finalJeopardyInitialScores: stateData.finalJeopardyInitialScores,
      finalJeopardyJudgingOrder: stateData.finalJeopardyJudgingOrder,
      finalJeopardyClueShown: stateData.finalJeopardyClueShown,
      finalJeopardyCountdownStart: stateData.finalJeopardyCountdownStart,
      finalJeopardyCountdownEnd: stateData.finalJeopardyCountdownEnd,
      finalJeopardyJudgingPlayerIndex:
        stateData.finalJeopardyJudgingPlayerIndex,
      finalJeopardyRevealedWager: stateData.finalJeopardyRevealedWager,
      finalJeopardyRevealedAnswer: stateData.finalJeopardyRevealedAnswer,
    };
  }

  private emitRoomJoined(): void {
    if (!this.roomId) return;

    const serializedState = this.serializeGameState();
    this.emit('roomJoined', {
      type: 'roomJoined',
      roomId: this.roomId,
      gameState: serializedState,
      playerId: this.playerId || '',
    });
  }

  private emitGameStateUpdate(): void {
    const serializedState = this.serializeGameState();
    this.emit('gameStateUpdate', {
      type: 'gameStateUpdate',
      gameState: serializedState,
    });
  }

  private serializeGameState(): any {
    return {
      roomId: this.roomId,
      config: this.gameConfig,
      status: this.gameState?.status || 'waiting',
      currentRound: this.gameState?.currentRound || 'jeopardy',
      selectedClue: this.gameState?.selectedClue || null,
      players: Array.from(this.players.values()),
      buzzerOrder: this.gameState?.buzzerOrder || [],
      resolvedBuzzerOrder: this.gameState?.resolvedBuzzerOrder || [],
      displayBuzzerOrder: this.gameState?.displayBuzzerOrder || [],
      currentPlayer: this.gameState?.currentPlayer || null,
      judgedPlayers: this.gameState?.judgedPlayers || [],
      notPickedInTies: this.gameState?.notPickedInTies || [],
      lastCorrectPlayer: this.gameState?.lastCorrectPlayer || null,
      hostId: this.metadata?.hostId || '',
      finalJeopardyInitialScores: this.gameState?.finalJeopardyInitialScores,
      finalJeopardyJudgingOrder: this.gameState?.finalJeopardyJudgingOrder,
      finalJeopardyClueShown: this.gameState?.finalJeopardyClueShown,
      finalJeopardyCountdownStart: this.gameState?.finalJeopardyCountdownStart,
      finalJeopardyCountdownEnd: this.gameState?.finalJeopardyCountdownEnd,
      finalJeopardyJudgingPlayerIndex:
        this.gameState?.finalJeopardyJudgingPlayerIndex,
      finalJeopardyRevealedWager: this.gameState?.finalJeopardyRevealedWager,
      finalJeopardyRevealedAnswer: this.gameState?.finalJeopardyRevealedAnswer,
    };
  }

  // Buzzer processing (host only)
  private async processBuzzes(): Promise<void> {
    if (this.role !== 'host' || !this.roomId) return;
    if (this.buzzes.length === 0) return;
    if (
      this.gameState?.status !== 'buzzing' &&
      this.gameState?.status !== 'answering'
    )
      return;

    // If current player already selected, handle late buzzes
    if (this.gameState?.currentPlayer) {
      await this.handleLateBuzzes();
      return;
    }

    // Clear existing timeout
    if (this.buzzerProcessTimeout) {
      clearTimeout(this.buzzerProcessTimeout);
    }

    // Wait for tie window to close
    const firstBuzzTime = this.buzzes[0].serverTimestamp.toMillis();
    const now = Date.now();
    const elapsed = now - firstBuzzTime;
    const remainingWait = Math.max(0, BUZZER_PROCESS_DELAY_MS - elapsed);

    this.buzzerProcessTimeout = setTimeout(async () => {
      await this.finalizeBuzzerSelection();
    }, remainingWait);
  }

  // Handle late buzzes that come in after currentPlayer is already set
  private async handleLateBuzzes(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const currentDisplayOrder = this.gameState?.displayBuzzerOrder || [];

    // Deduplicate buzzes - keep only first buzz from each player
    const seenPlayers = new Set<string>();
    const uniqueBuzzes = this.buzzes.filter((b) => {
      if (seenPlayers.has(b.playerId)) {
        return false;
      }
      seenPlayers.add(b.playerId);
      return true;
    });

    const allBuzzPlayerIds = uniqueBuzzes.map((b) => b.playerId);

    // Check if there are any new buzzes not in displayBuzzerOrder
    const newBuzzes = allBuzzPlayerIds.filter(
      (id) => !currentDisplayOrder.includes(id),
    );

    if (newBuzzes.length === 0) return;

    // Add new late buzzes to the display order
    const updatedDisplayOrder = [...currentDisplayOrder, ...newBuzzes];
    const updatedBuzzerOrder = allBuzzPlayerIds;

    const db = getFirestoreDb();
    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      buzzerOrder: updatedBuzzerOrder,
      displayBuzzerOrder: updatedDisplayOrder,
    });
  }

  private async finalizeBuzzerSelection(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;
    if (this.buzzes.length === 0) return;
    if (this.gameState?.currentPlayer) return;

    const db = getFirestoreDb();

    // Deduplicate buzzes - keep only the first buzz from each player
    const seenPlayers = new Set<string>();
    const uniqueBuzzes = this.buzzes.filter((b) => {
      if (seenPlayers.has(b.playerId)) {
        return false;
      }
      seenPlayers.add(b.playerId);
      return true;
    });

    if (uniqueBuzzes.length === 0) return;

    const firstBuzzTime = uniqueBuzzes[0].serverTimestamp.toMillis();

    // Find all buzzes within tie window
    const tiedBuzzes = uniqueBuzzes.filter(
      (b) => b.serverTimestamp.toMillis() - firstBuzzTime <= TIE_WINDOW_MS,
    );

    // Apply tie resolution logic
    const selectedPlayerId = this.selectFromTie(tiedBuzzes);

    // Update buzzer order (deduplicated)
    const buzzerOrder = uniqueBuzzes.map((b) => b.playerId);
    const displayBuzzerOrder = [selectedPlayerId];
    buzzerOrder.forEach((id) => {
      if (id !== selectedPlayerId && !displayBuzzerOrder.includes(id)) {
        displayBuzzerOrder.push(id);
      }
    });

    // Update game state
    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      currentPlayer: selectedPlayerId,
      status: 'answering',
      buzzerOrder,
      resolvedBuzzerOrder: displayBuzzerOrder,
      displayBuzzerOrder,
      notPickedInTies: this.gameState?.notPickedInTies || [],
    });
  }

  private selectFromTie(tiedBuzzes: BuzzRecord[]): string {
    // Deduplicate player IDs (should already be deduplicated, but safety check)
    const tiedPlayerIds = [...new Set(tiedBuzzes.map((b) => b.playerId))];
    const notPickedInTies = this.gameState?.notPickedInTies || [];

    console.log('tiedPlayerIds', tiedPlayerIds);
    console.log('notPickedInTies', notPickedInTies);

    // Priority: players who haven't been picked in previous ties
    const priorityPlayers = tiedPlayerIds.filter((id) =>
      notPickedInTies.includes(id),
    );

    let selectedPlayerId: string;
    if (priorityPlayers.length > 0) {
      selectedPlayerId = priorityPlayers[0];
    } else {
      selectedPlayerId = tiedPlayerIds[0];
    }

    // Update notPickedInTies list
    const updatedNotPicked = notPickedInTies.filter(
      (id) => id !== selectedPlayerId,
    );
    tiedPlayerIds.forEach((id) => {
      if (id !== selectedPlayerId && !updatedNotPicked.includes(id)) {
        updatedNotPicked.push(id);
      }
    });

    // Store updated list for next update
    if (this.gameState) {
      this.gameState.notPickedInTies = updatedNotPicked;
    }

    console.log('selectedPlayerId', selectedPlayerId);
    return selectedPlayerId;
  }

  // Player actions
  async buzz(): Promise<void> {
    if (!this.roomId || !this.playerId) return;
    if (this.role !== 'player') return;

    // Check if game state allows buzzing
    const status = this.gameState?.status;
    if (
      status !== 'clueRevealed' &&
      status !== 'buzzing' &&
      status !== 'answering'
    ) {
      console.log(
        '[FirestoreClient] Cannot buzz - invalid game status:',
        status,
      );
      return;
    }

    // Check if player has already buzzed for this clue
    const alreadyBuzzed = this.buzzes.some((b) => b.playerId === this.playerId);
    if (alreadyBuzzed) {
      console.log(
        '[FirestoreClient] Cannot buzz - already buzzed for this clue',
      );
      return;
    }

    const db = getFirestoreDb();
    await addDoc(collection(db, 'games', this.roomId, 'buzzes'), {
      playerId: this.playerId,
      clientTimestamp: Date.now(),
      serverTimestamp: serverTimestamp(),
    });
  }

  async submitWager(wager: number): Promise<void> {
    if (!this.roomId || !this.playerId) return;

    const db = getFirestoreDb();
    await updateDoc(doc(db, 'games', this.roomId, 'players', this.playerId), {
      finalJeopardyWager: wager,
    });
  }

  async submitFinalAnswer(answer: string): Promise<void> {
    if (!this.roomId || !this.playerId) return;

    // Check if countdown expired
    if (
      this.gameState?.finalJeopardyCountdownEnd &&
      Date.now() > this.gameState.finalJeopardyCountdownEnd
    ) {
      return;
    }

    const db = getFirestoreDb();
    await updateDoc(doc(db, 'games', this.roomId, 'players', this.playerId), {
      finalJeopardyAnswer: answer,
    });
  }

  // Host actions
  async selectClue(categoryId: string, clueId: string): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();

    // Get the clue to calculate speaking time
    let speakingTime = 3000;
    if (this.gameConfig) {
      const round =
        this.gameState?.currentRound === 'jeopardy'
          ? this.gameConfig.jeopardy
          : this.gameConfig.doubleJeopardy;
      const category = round?.categories.find((c) => c.id === categoryId);
      const clue = category?.clues.find((c) => c.id === clueId);
      if (clue) {
        speakingTime = calculateSpeakingTime(clue.clue);
        // Mark clue as revealed in config
        clue.revealed = true;
        await setDoc(
          doc(db, 'games', this.roomId, 'config', 'current'),
          this.gameConfig,
        );
      }
    }

    // Clear existing buzzes
    const buzzesSnap = await getDocs(
      collection(db, 'games', this.roomId, 'buzzes'),
    );
    const batch = writeBatch(db);
    buzzesSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Update game state
    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      selectedClue: { categoryId, clueId },
      status: 'clueRevealed',
      buzzerOrder: [],
      resolvedBuzzerOrder: [],
      displayBuzzerOrder: [],
      currentPlayer: null,
      judgedPlayers: [],
      buzzerLocked: true,
      buzzerUnlockTime: speakingTime,
    });

    // Unlock buzzer after speaking time
    setTimeout(async () => {
      const stateSnap = await getDoc(
        doc(db, 'games', this.roomId!, 'state', 'current'),
      );
      if (stateSnap.exists()) {
        const state = stateSnap.data() as FirestoreGameState;
        if (state.status === 'clueRevealed') {
          await updateDoc(doc(db, 'games', this.roomId!, 'state', 'current'), {
            status: 'buzzing',
            buzzerLocked: false,
          });
        }
      }
    }, speakingTime);
  }

  async revealAnswer(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();
    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      status: 'judging',
    });
  }

  async judgeAnswer(correct: boolean, playerId: string): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;
    if (!this.gameState?.selectedClue || !this.gameConfig) return;

    const db = getFirestoreDb();

    // Read current state from Firestore to get latest buzzer order (including late buzzes)
    const stateSnap = await getDoc(
      doc(db, 'games', this.roomId, 'state', 'current'),
    );
    if (!stateSnap.exists()) return;
    const currentState = stateSnap.data() as FirestoreGameState;

    const judgedPlayers = [...(currentState.judgedPlayers || [])];

    if (judgedPlayers.includes(playerId)) return;

    // Get clue value
    const round =
      this.gameState.currentRound === 'jeopardy'
        ? this.gameConfig.jeopardy
        : this.gameConfig.doubleJeopardy;
    const category = round?.categories.find(
      (c) => c.id === this.gameState!.selectedClue!.categoryId,
    );
    const clue = category?.clues.find(
      (c) => c.id === this.gameState!.selectedClue!.clueId,
    );
    if (!clue) return;

    // Update player score
    const player = this.players.get(playerId);
    if (player) {
      const newScore = correct
        ? player.score + clue.value
        : player.score - clue.value;
      await updateDoc(doc(db, 'games', this.roomId, 'players', playerId), {
        score: newScore,
      });
    }

    judgedPlayers.push(playerId);

    if (correct) {
      // Mark clue as answered
      clue.answered = true;
      await setDoc(
        doc(db, 'games', this.roomId, 'config', 'current'),
        this.gameConfig,
      );

      await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
        judgedPlayers,
        lastCorrectPlayer: playerId,
      });
    } else {
      // Find next player using latest displayBuzzerOrder from Firestore
      const displayOrder = currentState.displayBuzzerOrder || [];
      const currentIndex = displayOrder.indexOf(playerId);
      let nextPlayerId: string | null = null;

      for (let i = currentIndex + 1; i < displayOrder.length; i++) {
        if (!judgedPlayers.includes(displayOrder[i])) {
          nextPlayerId = displayOrder[i];
          break;
        }
      }

      await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
        judgedPlayers,
        currentPlayer: nextPlayerId,
        status: nextPlayerId ? 'answering' : 'judging',
      });
    }
  }

  async updateScore(playerId: string, delta: number): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();
    const player = this.players.get(playerId);
    if (player) {
      await updateDoc(doc(db, 'games', this.roomId, 'players', playerId), {
        score: player.score + delta,
      });
    }
  }

  async nextRound(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();
    if (this.gameState?.currentRound === 'jeopardy') {
      await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
        currentRound: 'doubleJeopardy',
        status: 'selecting',
        selectedClue: null,
        buzzerOrder: [],
        currentPlayer: null,
        lastCorrectPlayer: null,
      });
    }
  }

  async returnToBoard(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();

    // Clear buzzes
    const buzzesSnap = await getDocs(
      collection(db, 'games', this.roomId, 'buzzes'),
    );
    const batch = writeBatch(db);
    buzzesSnap.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      status: 'selecting',
      selectedClue: null,
      currentPlayer: null,
      buzzerOrder: [],
      resolvedBuzzerOrder: [],
      displayBuzzerOrder: [],
      judgedPlayers: [],
      buzzerLocked: true,
    });
  }

  async startGame(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();
    if (this.gameState?.status === 'ready') {
      await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
        status: 'selecting',
      });
    }
  }

  // Final Jeopardy actions
  async startFinalJeopardy(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();

    // Capture initial scores and create judging order
    const initialScores: Record<string, number> = {};
    const judgingOrder: string[] = [];
    const playersArray = Array.from(this.players.entries())
      .map(([id, p]) => ({ id, score: p.score }))
      .sort((a, b) => a.score - b.score);

    playersArray.forEach(({ id, score }) => {
      initialScores[id] = score;
      if (score > 0) {
        judgingOrder.push(id);
      }
    });

    // Clear wagers and answers
    const batch = writeBatch(db);
    this.players.forEach((player, id) => {
      batch.update(doc(db, 'games', this.roomId!, 'players', id), {
        finalJeopardyWager: null,
        finalJeopardyAnswer: null,
      });
    });
    await batch.commit();

    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      currentRound: 'finalJeopardy',
      status: 'finalJeopardyWagering',
      finalJeopardyInitialScores: initialScores,
      finalJeopardyJudgingOrder: judgingOrder,
      finalJeopardyClueShown: false,
      finalJeopardyCountdownStart: null,
      finalJeopardyCountdownEnd: null,
      finalJeopardyJudgingPlayerIndex: null,
      finalJeopardyRevealedWager: false,
      finalJeopardyRevealedAnswer: false,
    });
  }

  async showFinalJeopardyClue(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();
    const now = Date.now();

    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      status: 'finalJeopardyAnswering',
      finalJeopardyClueShown: true,
      finalJeopardyCountdownStart: now,
      finalJeopardyCountdownEnd: now + 30000,
    });
  }

  async startFinalJeopardyJudging(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();
    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      status: 'finalJeopardyJudging',
      finalJeopardyJudgingPlayerIndex: 0,
      finalJeopardyRevealedWager: false,
      finalJeopardyRevealedAnswer: false,
    });
  }

  async revealFinalJeopardyWager(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();
    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      finalJeopardyRevealedWager: true,
    });
  }

  async revealFinalJeopardyAnswer(): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();
    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      finalJeopardyRevealedAnswer: true,
    });
  }

  async revealFinalAnswers(): Promise<void> {
    // This method is for legacy compatibility
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();
    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      status: 'finished',
    });
  }

  async judgeFinalJeopardyAnswer(
    playerId: string,
    correct: boolean,
  ): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;
    if (!this.gameState?.finalJeopardyJudgingOrder) return;
    if (this.gameState.finalJeopardyJudgingPlayerIndex === undefined) return;

    const currentPlayerId =
      this.gameState.finalJeopardyJudgingOrder[
        this.gameState.finalJeopardyJudgingPlayerIndex
      ];
    if (currentPlayerId !== playerId) return;

    const db = getFirestoreDb();
    const player = this.players.get(playerId);
    if (!player || player.finalJeopardyWager === undefined) return;

    // Update score
    const newScore = correct
      ? player.score + player.finalJeopardyWager
      : player.score - player.finalJeopardyWager;

    await updateDoc(doc(db, 'games', this.roomId, 'players', playerId), {
      score: newScore,
    });

    // Move to next player or finish
    const nextIndex = this.gameState.finalJeopardyJudgingPlayerIndex + 1;
    if (nextIndex >= this.gameState.finalJeopardyJudgingOrder.length) {
      await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
        status: 'finished',
      });
    } else {
      await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
        finalJeopardyJudgingPlayerIndex: nextIndex,
        finalJeopardyRevealedWager: false,
        finalJeopardyRevealedAnswer: false,
      });
    }
  }

  // Game management
  createGame(
    prompt: string,
    difficulty?: string,
    sourceMaterial?: string,
  ): void {
    // This is handled by the API route, not directly by the client
    console.warn('createGame is not implemented in FirestoreClient');
  }

  async saveGame(gameConfig: GameConfig): Promise<void> {
    // Save game config to savedGames collection for later reuse
    const db = getFirestoreDb();
    const user = getCurrentUser();

    await setDoc(doc(db, 'savedGames', gameConfig.id), {
      ...gameConfig,
      savedAt: serverTimestamp(),
      // Track who saved the game (for filtering/ownership)
      savedBy: user
        ? {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
          }
        : null,
    });

    console.log('Game saved to Firestore:', gameConfig.id);
    this.emit('gameSaved', { type: 'gameSaved', gameId: gameConfig.id });
  }

  async loadGame(gameConfig: GameConfig): Promise<void> {
    if (!this.roomId || this.role !== 'host') return;

    const db = getFirestoreDb();

    // Save config
    await setDoc(
      doc(db, 'games', this.roomId, 'config', 'current'),
      gameConfig,
    );

    // Update state to ready
    await updateDoc(doc(db, 'games', this.roomId, 'state', 'current'), {
      status: 'ready',
    });
  }
}
