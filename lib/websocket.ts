import {
  ClientMessage,
  ServerMessage,
  GameState,
  GameConfig,
} from '@/shared/types';
import { IGameClient } from './game-client-interface';

export class WebSocketClient implements IGameClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000; // Base delay in ms
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private connectionStateListeners: Set<(connected: boolean) => void> =
    new Set();
  private roomId: string | null = null;
  private playerId: string | null = null;
  private autoReconnect: boolean = true;
  private isConnected: boolean = false;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private lastPongTime: number = 0;
  private pingInterval = 1000; // Send ping every 1 second
  private pongTimeout = 3000; // Consider dead if no pong in 3 seconds
  private isHandlingDeadConnection: boolean = false;

  constructor(
    private url: string,
    autoReconnect: boolean = true,
  ) {
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
    this.connectionStateListeners.forEach((callback) => callback(connected));
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
          this.lastPongTime = Date.now();
          this.isHandlingDeadConnection = false;
          this.startKeepAlive();
          this.notifyConnectionState(true);
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: ServerMessage = JSON.parse(event.data);
            // Update last pong time when we receive a pong
            if (message.type === 'pong') {
              this.lastPongTime = Date.now();
            }
            this.handleMessage(message);
          } catch (error) {
            console.warn('Error parsing message:', error);
          }
        };

        this.ws.onerror = (error) => {
          console.warn('WebSocket error:', error);
          // Don't reject immediately - let onclose handle it to avoid race conditions
          // The error will be handled when onclose fires
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.stopKeepAlive();
          const wasConnected = this.isConnected;
          this.ws = null;

          // If this was a connection attempt that failed (never opened), reject the promise
          // (This handles the case where connect() was called but failed immediately)
          // The .catch() handler in attemptReconnect() will handle reconnection
          if (!wasConnected) {
            reject(new Error('WebSocket connection failed'));
            return; // Don't attempt reconnect here - let the .catch() handler do it
          }

          // Connection was open and then closed - update state and reconnect
          this.notifyConnectionState(false);

          // Only attempt reconnect if we're not already handling a dead connection
          // (to avoid duplicate reconnection attempts)
          if (!this.isHandlingDeadConnection) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private startKeepAlive() {
    this.stopKeepAlive(); // Clear any existing interval
    this.keepAliveInterval = setInterval(() => {
      this.sendPing();
      this.checkConnectionHealth();
    }, this.pingInterval);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private sendPing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: 'ping',
        timestamp: Date.now(),
      });
    }
  }

  private checkConnectionHealth() {
    if (!this.ws || this.isHandlingDeadConnection) {
      return;
    }

    const now = Date.now();
    const timeSinceLastPong = now - this.lastPongTime;
    const isReadyStateOpen = this.ws.readyState === WebSocket.OPEN;

    // If readyState is not OPEN, connection is dead
    if (!isReadyStateOpen) {
      console.log('Connection health check failed: readyState is not OPEN');
      this.handleConnectionDead();
      return;
    }

    // If we haven't received a pong in the timeout period, consider connection dead
    // This catches cases where the network is offline but the socket hasn't closed yet
    if (timeSinceLastPong > this.pongTimeout) {
      console.log(
        `Connection health check failed: no pong received in ${timeSinceLastPong}ms`,
      );
      this.handleConnectionDead();
      return;
    }
  }

  private handleConnectionDead() {
    // Prevent multiple calls
    if (this.isHandlingDeadConnection) {
      return;
    }
    this.isHandlingDeadConnection = true;

    console.log(
      'Handling dead connection - closing and triggering reconnection',
    );
    this.stopKeepAlive();

    // Manually close the connection
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // Ignore errors when closing
      }
      this.ws = null;
    }

    // Manually trigger disconnect notification and reconnection
    // (in case onclose doesn't fire when network is offline)
    this.notifyConnectionState(false);
    this.attemptReconnect();
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
        30000,
      );
      console.log(
        `Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectTimeout = null;
        console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
        this.connect()
          .then(() => {
            // Connection successful - reset attempts counter will happen in onopen
            console.log('Reconnection successful');
          })
          .catch((error) => {
            console.error('Reconnection failed:', error);
            // Continue attempting to reconnect by calling attemptReconnect again
            // Reset the flag so we can try again
            this.isHandlingDeadConnection = false;
            this.attemptReconnect();
          });
      }, delay);
    } else {
      console.log('Max reconnection attempts reached');
      this.isHandlingDeadConnection = false; // Reset flag even if we've given up
    }
  }

  private handleMessage(message: ServerMessage) {
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      listeners.forEach((listener) => listener(message));
    }
  }

  on<T extends ServerMessage>(type: T['type'], callback: (message: T) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);
  }

  off<T extends ServerMessage>(
    type: T['type'],
    callback: (message: T) => void,
  ) {
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

  joinRoom(
    roomId: string | null,
    playerName: string | undefined,
    role: 'host' | 'player' | 'viewer',
    playerId?: string,
  ) {
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

  unlockBuzzers() {
    this.send({
      type: 'unlockBuzzers',
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

  showFinalJeopardyClue() {
    this.send({
      type: 'showFinalJeopardyClue',
    });
  }

  startFinalJeopardyTimer() {
    this.send({
      type: 'startFinalJeopardyTimer',
    });
  }

  startFinalJeopardyJudging() {
    this.send({
      type: 'startFinalJeopardyJudging',
    });
  }

  revealFinalJeopardyWager() {
    this.send({
      type: 'revealFinalJeopardyWager',
    });
  }

  revealFinalJeopardyAnswer() {
    this.send({
      type: 'revealFinalJeopardyAnswer',
    });
  }

  judgeFinalJeopardyAnswer(playerId: string, correct: boolean) {
    this.send({
      type: 'judgeFinalJeopardyAnswer',
      playerId,
      correct,
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

  saveGame(gameConfig: GameConfig) {
    this.send({
      type: 'saveGame',
      gameConfig,
    });
  }

  loadGame(gameConfig: GameConfig) {
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
    this.stopKeepAlive();
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
