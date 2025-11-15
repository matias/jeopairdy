import { ClientMessage, ServerMessage, GameState } from '@/shared/types';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // Base delay in ms
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private connectionStateListeners: Set<(connected: boolean) => void> = new Set();
  private roomId: string | null = null;
  private playerId: string | null = null;
  private autoReconnect: boolean = true;
  private isConnected: boolean = false;

  constructor(private url: string, autoReconnect: boolean = true) {
    this.autoReconnect = autoReconnect;
  }

  enableAutoReconnect() {
    this.autoReconnect = true;
  }

  disableAutoReconnect() {
    this.autoReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  onConnectionStateChange(callback: (connected: boolean) => void) {
    this.connectionStateListeners.add(callback);
    return () => {
      this.connectionStateListeners.delete(callback);
    };
  }

  private notifyConnectionState(connected: boolean) {
    this.isConnected = connected;
    this.connectionStateListeners.forEach(callback => callback(connected));
  }

  getConnected(): boolean {
    return this.isConnected;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Convert http/https URL to ws/wss, or use as-is if already ws/wss
        let wsUrl = this.url;
        if (wsUrl.startsWith('http://')) {
          wsUrl = wsUrl.replace('http://', 'ws://');
        } else if (wsUrl.startsWith('https://')) {
          wsUrl = wsUrl.replace('https://', 'wss://');
        } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
          // If no protocol, assume ws://
          wsUrl = `ws://${wsUrl}`;
        }
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.notifyConnectionState(true);
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.ws = null;
          this.notifyConnectionState(false);
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect() {
    if (!this.autoReconnect) {
      return;
    }
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      // Exponential backoff: 2^attempt * baseDelay, capped at 30 seconds
      const delay = Math.min(
        Math.pow(2, this.reconnectAttempts - 1) * this.baseReconnectDelay,
        30000
      );
      console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
        this.connect().catch((error) => {
          console.error('Reconnection failed:', error);
          // Continue attempting to reconnect
        });
      }, delay);
    } else {
      console.log('Max reconnection attempts reached');
    }
  }

  private handleMessage(message: ServerMessage) {
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach(listener => listener(message));
    }
  }

  on<T extends ServerMessage>(type: T['type'], callback: (message: T) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
  }

  off<T extends ServerMessage>(type: T['type'], callback: (message: T) => void) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  send(message: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket not connected');
    }
  }

  joinRoom(roomId: string | null, playerName: string | undefined, role: 'host' | 'player' | 'viewer', playerId?: string) {
    this.roomId = roomId;
    this.send({
      type: 'joinRoom',
      roomId: roomId || '',
      playerName,
      role,
      playerId: playerId || this.playerId || undefined,
    });
  }

  buzz() {
    const timestamp = Date.now();
    this.send({
      type: 'buzz',
      timestamp,
    });
  }

  selectClue(categoryId: string, clueId: string) {
    this.send({
      type: 'selectClue',
      categoryId,
      clueId,
    });
  }

  revealAnswer() {
    this.send({
      type: 'revealAnswer',
    });
  }

  judgeAnswer(correct: boolean, playerId: string) {
    this.send({
      type: 'judgeAnswer',
      correct,
      playerId,
    });
  }

  updateScore(playerId: string, delta: number) {
    this.send({
      type: 'updateScore',
      playerId,
      delta,
    });
  }

  nextRound() {
    this.send({
      type: 'nextRound',
    });
  }

  startFinalJeopardy() {
    this.send({
      type: 'startFinalJeopardy',
    });
  }

  submitWager(wager: number) {
    this.send({
      type: 'submitWager',
      wager,
    });
  }

  submitFinalAnswer(answer: string) {
    this.send({
      type: 'submitFinalAnswer',
      answer,
    });
  }

  revealFinalAnswers() {
    this.send({
      type: 'revealFinalAnswers',
    });
  }

  createGame(prompt: string, difficulty?: string, sourceMaterial?: string) {
    this.send({
      type: 'createGame',
      prompt,
      difficulty,
      sourceMaterial,
    });
  }

  loadGame(gameConfig: any) {
    this.send({
      type: 'loadGame',
      gameConfig,
    });
  }

  returnToBoard() {
    this.send({
      type: 'returnToBoard',
    });
  }

  startGame() {
    this.send({
      type: 'startGame',
    });
  }

  disconnect() {
    this.disableAutoReconnect();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyConnectionState(false);
    this.listeners.clear();
  }

  getRoomId(): string | null {
    return this.roomId;
  }

  getPlayerId(): string | null {
    return this.playerId;
  }

  setPlayerId(playerId: string) {
    this.playerId = playerId;
  }
}

