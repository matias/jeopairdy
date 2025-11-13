const { gameManager } = require('../game/state');
const { v4: uuidv4 } = require('uuid');

const connections = new Map();

function generateRoomId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function serializeGameState(gameState) {
  return {
    ...gameState,
    players: Array.from(gameState.players.entries()).map(([id, player]) => ({
      id,
      ...player,
    })),
  };
}

function handleWebSocket(ws, req) {
  const conn = {
    ws,
    roomId: null,
    playerId: null,
    role: null,
  };
  connections.set(ws, conn);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleMessage(ws, data, conn);
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    connections.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    connections.delete(ws);
  });
}

function handleMessage(ws, message, conn) {
  switch (message.type) {
    case 'joinRoom':
      handleJoinRoom(ws, message, conn);
      break;
    case 'buzz':
      handleBuzz(ws, message, conn);
      break;
    case 'selectClue':
      handleSelectClue(ws, message, conn);
      break;
    case 'revealAnswer':
      handleRevealAnswer(ws, message, conn);
      break;
    case 'judgeAnswer':
      handleJudgeAnswer(ws, message, conn);
      break;
    case 'updateScore':
      handleUpdateScore(ws, message, conn);
      break;
    case 'nextRound':
      handleNextRound(ws, message, conn);
      break;
    case 'startFinalJeopardy':
      handleStartFinalJeopardy(ws, message, conn);
      break;
    case 'submitWager':
      handleSubmitWager(ws, message, conn);
      break;
    case 'submitFinalAnswer':
      handleSubmitFinalAnswer(ws, message, conn);
      break;
    case 'revealFinalAnswers':
      handleRevealFinalAnswers(ws, message, conn);
      break;
    case 'createGame':
      handleCreateGame(ws, message, conn).catch(error => {
        console.error('Error in handleCreateGame:', error);
        ws.send(JSON.stringify({ type: 'error', message: `Error creating game: ${error.message}` }));
      });
      break;
    case 'loadGame':
      handleLoadGame(ws, message, conn);
      break;
    case 'returnToBoard':
      handleReturnToBoard(ws, message, conn);
      break;
    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

function handleJoinRoom(ws, message, conn) {
  let { roomId, playerName, role, playerId: requestedPlayerId } = message;

  if (role === 'host') {
    // Host creates or joins room
    if (!roomId) {
      // Generate new room ID
      do {
        roomId = generateRoomId();
      } while (gameManager.getGame(roomId));
    }

    const playerId = uuidv4();
    let gameState = gameManager.getGame(roomId);
    
    if (!gameState) {
      gameState = gameManager.createRoom(roomId, playerId);
    }

    conn.roomId = roomId;
    conn.playerId = playerId;
    conn.role = 'host';

    ws.send(JSON.stringify({
      type: 'roomJoined',
      roomId,
      gameState: serializeGameState(gameState),
      playerId,
    }));

    // Broadcast to all connections in room
    broadcastToRoom(roomId, {
      type: 'gameStateUpdate',
      gameState: serializeGameState(gameState),
    }, ws);
  } else {
    // Player joins room
    if (!roomId) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room ID required' }));
      return;
    }

    const gameState = gameManager.getGame(roomId);
    if (!gameState) {
      ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
      return;
    }

    // Check if this is a reconnect (playerId provided and exists in game)
    let playerId = requestedPlayerId || conn.playerId;
    let isReconnect = false;
    
    if (playerId && gameState.players.has(playerId)) {
      // Reconnecting with existing playerId
      isReconnect = true;
    } else {
      // New player - generate new ID
      playerId = uuidv4();
    }

    const name = playerName || (isReconnect ? gameState.players.get(playerId)?.name : `Player ${Array.from(gameState.players.values()).length + 1}`);
    
    // Only add player if they don't already exist
    if (!isReconnect) {
      gameManager.addPlayer(roomId, playerId, name);
    }
    
    const updatedGameState = gameManager.getGame(roomId);

    conn.roomId = roomId;
    conn.playerId = playerId;
    conn.role = 'player';

    ws.send(JSON.stringify({
      type: 'roomJoined',
      roomId,
      gameState: serializeGameState(updatedGameState),
      playerId,
    }));

    // Only broadcast update if this is a new player (not a reconnect)
    if (!isReconnect) {
      broadcastToRoom(roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(updatedGameState),
      }, ws);
    }
  }
}

function handleBuzz(ws, message, conn) {
  if (!conn.roomId || !conn.playerId || conn.role !== 'player') {
    ws.send(JSON.stringify({ type: 'error', message: 'Not a player in a room' }));
    return;
  }

  const { timestamp } = message;
  const success = gameManager.handleBuzz(conn.roomId, conn.playerId, timestamp);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      // Broadcast buzz to all
      broadcastToRoom(conn.roomId, {
        type: 'buzzReceived',
        playerId: conn.playerId,
        timestamp,
      });

      // Update game state
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  }
}

function handleSelectClue(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can select clues' }));
    return;
  }

  const { categoryId, clueId } = message;
  const success = gameManager.selectClue(conn.roomId, categoryId, clueId);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });

      // Lock buzzer initially
      broadcastToRoom(conn.roomId, {
        type: 'buzzerLocked',
        locked: true,
      });

      // Unlock after delay (handled in game state)
      setTimeout(() => {
        const currentGame = gameManager.getGame(conn.roomId);
        if (currentGame && currentGame.status === 'buzzing') {
          broadcastToRoom(conn.roomId, {
            type: 'buzzerLocked',
            locked: false,
          });
        }
      }, 3000);
    }
  }
}

function handleRevealAnswer(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can reveal answers' }));
    return;
  }

  const gameState = gameManager.getGame(conn.roomId);
  if (gameState) {
    gameState.status = 'judging';
    broadcastToRoom(conn.roomId, {
      type: 'gameStateUpdate',
      gameState: serializeGameState(gameState),
    });
  }
}

function handleJudgeAnswer(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can judge answers' }));
    return;
  }

  const { correct, playerId } = message;
  const success = gameManager.judgeAnswer(conn.roomId, playerId, correct);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      // If status changed to "selecting" (clue went unanswered), lock buzzer
      if (gameState.status === 'selecting') {
        broadcastToRoom(conn.roomId, {
          type: 'buzzerLocked',
          locked: true,
        });
      }
      
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  }
}

function handleUpdateScore(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can update scores' }));
    return;
  }

  const { playerId, delta } = message;
  const success = gameManager.updateScore(conn.roomId, playerId, delta);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  }
}

function handleNextRound(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can advance rounds' }));
    return;
  }

  const success = gameManager.nextRound(conn.roomId);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  }
}

function handleStartFinalJeopardy(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can start Final Jeopardy' }));
    return;
  }

  const success = gameManager.startFinalJeopardy(conn.roomId);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  }
}

function handleSubmitWager(ws, message, conn) {
  if (!conn.roomId || !conn.playerId || conn.role !== 'player') {
    ws.send(JSON.stringify({ type: 'error', message: 'Not a player in a room' }));
    return;
  }

  const { wager } = message;
  const success = gameManager.submitWager(conn.roomId, conn.playerId, wager);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  }
}

function handleSubmitFinalAnswer(ws, message, conn) {
  if (!conn.roomId || !conn.playerId || conn.role !== 'player') {
    ws.send(JSON.stringify({ type: 'error', message: 'Not a player in a room' }));
    return;
  }

  const { answer } = message;
  const success = gameManager.submitFinalAnswer(conn.roomId, conn.playerId, answer);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  }
}

function handleRevealFinalAnswers(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can reveal final answers' }));
    return;
  }

  const success = gameManager.revealFinalAnswers(conn.roomId);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  }
}

function handleLoadGame(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can load games' }));
    return;
  }

  const { gameConfig } = message;
  
  if (!gameConfig) {
    ws.send(JSON.stringify({ type: 'error', message: 'No game config provided' }));
    return;
  }

  const success = gameManager.setConfig(conn.roomId, gameConfig);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to load game' }));
  }
}

function handleReturnToBoard(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can return to board' }));
    return;
  }

  const success = gameManager.returnToBoard(conn.roomId);
  
  if (success) {
    const gameState = gameManager.getGame(conn.roomId);
    if (gameState) {
      // Lock buzzer when returning to board
      broadcastToRoom(conn.roomId, {
        type: 'buzzerLocked',
        locked: true,
      });
      
      broadcastToRoom(conn.roomId, {
        type: 'gameStateUpdate',
        gameState: serializeGameState(gameState),
      });
    }
  }
}

async function handleCreateGame(ws, message, conn) {
  if (!conn.roomId || conn.role !== 'host') {
    ws.send(JSON.stringify({ type: 'error', message: 'Only host can create games' }));
    return;
  }

  const { prompt, difficulty, sourceMaterial } = message;
  
  try {
    const { generateGame } = require('../ai/generator');
    const gameConfig = await generateGame(prompt, difficulty, sourceMaterial);
    
    // Set the game config
    const success = gameManager.setConfig(conn.roomId, gameConfig);
    
    if (success) {
      const gameState = gameManager.getGame(conn.roomId);
      if (gameState) {
        // Save to file for testing/replay
        const fs = require('fs').promises;
        const path = require('path');
        const testDataDir = path.join(__dirname, '../../test-data');
        
        try {
          await fs.mkdir(testDataDir, { recursive: true });
          const filePath = path.join(testDataDir, `${gameConfig.id}.json`);
          await fs.writeFile(filePath, JSON.stringify(gameConfig, null, 2));
        } catch (error) {
          console.error('Error saving game config:', error);
        }

        broadcastToRoom(conn.roomId, {
          type: 'gameCreated',
          gameState: serializeGameState(gameState),
        });
      }
    } else {
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to create game' }));
    }
  } catch (error) {
    console.error('Error creating game:', error);
    ws.send(JSON.stringify({ type: 'error', message: `Error creating game: ${error.message}` }));
  }
}

function broadcastToRoom(roomId, message, excludeWs) {
  connections.forEach((conn, ws) => {
    if (conn.roomId === roomId && ws !== excludeWs && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  });
}

module.exports = { handleWebSocket };

