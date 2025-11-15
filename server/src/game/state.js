class GameManager {
  constructor() {
    this.games = new Map();
  }

  createRoom(roomId, hostId) {
    const gameState = {
      roomId,
      config: null,
      status: "waiting",
      currentRound: "jeopardy",
      selectedClue: null,
      players: new Map(),
      buzzerOrder: [],
      resolvedBuzzerOrder: [], // Buzzer order with tie resolution: currentPlayer first, then others (updated as judging progresses)
      displayBuzzerOrder: [], // Static display order: set once when tie is resolved, never changes (for UI)
      buzzTimestamps: [], // Array of {playerId, clientTimestamp, serverTimestamp}
      currentPlayer: null,
      judgedPlayers: [], // Track which players have been judged
      notPickedInTies: [], // Players who haven't been picked in ties (for fairness)
      lastCorrectPlayer: null, // Player who last answered correctly (has control of board)
      hostId,
    };
    this.games.set(roomId, gameState);
    return gameState;
  }

  getGame(roomId) {
    return this.games.get(roomId);
  }

  addPlayer(roomId, playerId, name) {
    const game = this.games.get(roomId);
    if (!game) return false;

    if (game.players.has(playerId)) return true;

    game.players.set(playerId, {
      id: playerId,
      name,
      score: 0,
    });
    return true;
  }

  updateGame(roomId, updates) {
    const game = this.games.get(roomId);
    if (!game) return null;

    Object.assign(game, updates);
    return game;
  }

  setConfig(roomId, config) {
    const game = this.games.get(roomId);
    if (!game) return false;

    game.config = config;
    game.status = "ready";
    return true;
  }

  selectClue(roomId, categoryId, clueId) {
    const game = this.games.get(roomId);
    if (!game || !game.config) return false;

    const round = game.currentRound === "jeopardy" 
      ? game.config.jeopardy 
      : game.config.doubleJeopardy;

    const category = round.categories.find(c => c.id === categoryId);
    if (!category) return false;

    const clue = category.clues.find(c => c.id === clueId);
    if (!clue || clue.revealed) return false;

    clue.revealed = true;
    game.selectedClue = { categoryId, clueId };
    game.status = "clueRevealed";
    game.buzzerOrder = [];
    game.resolvedBuzzerOrder = [];
    game.displayBuzzerOrder = [];
    game.buzzTimestamps = [];
    game.currentPlayer = null;
    game.judgedPlayers = []; // Reset judged players for new clue
    if (game.buzzerProcessTimeout) {
      clearTimeout(game.buzzerProcessTimeout);
      game.buzzerProcessTimeout = null;
    }

    // Unlock buzzer after a delay (simulate reading time)
    setTimeout(() => {
      const currentGame = this.games.get(roomId);
      if (currentGame && currentGame.status === "clueRevealed") {
        currentGame.status = "buzzing";
      }
    }, 3000); // 3 second delay

    return true;
  }

  handleBuzz(roomId, playerId, clientTimestamp, serverTimestamp) {
    const game = this.games.get(roomId);
    // Allow buzzes during "buzzing" or "answering" status (answering means someone was selected but others can still buzz late)
    if (!game || (game.status !== "buzzing" && game.status !== "answering")) return false;

    // Check if player exists
    if (!game.players.has(playerId)) return false;

    // Check if already buzzed (prevent duplicate buzzes from same player)
    if (game.buzzTimestamps.some(b => b.playerId === playerId)) {
      // Already buzzed, but return true so client knows it was received
      return true;
    }

    // Add to buzz timestamps with both client and server timestamps
    game.buzzTimestamps.push({
      playerId,
      clientTimestamp,
      serverTimestamp,
    });

    // Sort by server timestamp (most accurate for local network)
    game.buzzTimestamps.sort((a, b) => a.serverTimestamp - b.serverTimestamp);

    // Process buzzes with 250ms tie window (only processes if currentPlayer not set)
    this.processBuzzerOrder(roomId);

    return true;
  }

  processBuzzerOrder(roomId) {
    const game = this.games.get(roomId);
    if (!game || game.buzzTimestamps.length === 0) return;

    // Always update buzzerOrder to include all buzzes (even late ones)
    game.buzzerOrder = game.buzzTimestamps.map(b => b.playerId);

    // If current player already set, update displayBuzzerOrder to include late buzzes
    // (late buzzes won't change who gets to answer, but should be shown in UI)
    if (game.currentPlayer) {
      // Add any new late buzzes to displayBuzzerOrder while preserving existing order
      if (game.displayBuzzerOrder && game.displayBuzzerOrder.length > 0) {
        game.buzzerOrder.forEach(playerId => {
          if (!game.displayBuzzerOrder.includes(playerId)) {
            game.displayBuzzerOrder.push(playerId);
          }
        });
      }
      return;
    }

    const TIE_WINDOW_MS = 250;
    const firstServerTime = game.buzzTimestamps[0].serverTimestamp;
    
    // Find all buzzes within the tie window
    const tiedBuzzes = game.buzzTimestamps.filter(
      b => b.serverTimestamp - firstServerTime <= TIE_WINDOW_MS
    );

    // Always wait for the tie window to close, even if only one buzzer so far
    // This ensures fairness - someone else might buzz within 250ms
    // Set a timeout to process after the tie window closes
    if (game.buzzerProcessTimeout) {
      clearTimeout(game.buzzerProcessTimeout);
    }

    // Calculate how long to wait: tie window minus time already elapsed since first buzz
    const now = Date.now();
    const elapsed = now - firstServerTime;
    const remainingWait = Math.max(0, TIE_WINDOW_MS - elapsed) + 50; // Add 50ms buffer

    game.buzzerProcessTimeout = setTimeout(() => {
      const currentGame = this.games.get(roomId);
      if (!currentGame || currentGame.currentPlayer) return;

      // Re-check tied buzzes after window closes
      const allTiedBuzzes = currentGame.buzzTimestamps.filter(
        b => b.serverTimestamp - firstServerTime <= TIE_WINDOW_MS
      );

      // Determine who should get to answer
      let selectedPlayerId = null;

      if (allTiedBuzzes.length === 1) {
        // No tie, first buzzer wins
        selectedPlayerId = allTiedBuzzes[0].playerId;
      } else {
        // Tie detected - use fair selection logic
        selectedPlayerId = this.selectFromTie(currentGame, allTiedBuzzes);
      }

      // Update buzzer order (all buzzes, in order - includes late buzzes)
      // This ensures all players who buzzed are shown in the UI
      currentGame.buzzerOrder = currentGame.buzzTimestamps.map(b => b.playerId);

      // Set current player
      if (selectedPlayerId) {
        currentGame.currentPlayer = selectedPlayerId;
        currentGame.status = "answering";
        const player = currentGame.players.get(selectedPlayerId);
        if (player) {
          player.buzzedAt = allTiedBuzzes.find(b => b.playerId === selectedPlayerId)?.clientTimestamp || Date.now();
        }

        // Compute resolved buzzer order: currentPlayer first, then others in original order
        currentGame.resolvedBuzzerOrder = this.computeResolvedBuzzerOrder(currentGame);
        // Set display order once - this stays static for UI display
        // Use the original buzzerOrder but put the selected player first
        if (!currentGame.displayBuzzerOrder || currentGame.displayBuzzerOrder.length === 0) {
          currentGame.displayBuzzerOrder = [selectedPlayerId];
          currentGame.buzzerOrder.forEach(playerId => {
            if (playerId !== selectedPlayerId) {
              currentGame.displayBuzzerOrder.push(playerId);
            }
          });
        }

        // Trigger broadcast via callback if set
        if (currentGame.onBuzzerProcessed) {
          currentGame.onBuzzerProcessed(roomId);
        }
      }

      // Log debugging info for host
      this.logBuzzerDebug(currentGame, allTiedBuzzes, selectedPlayerId);
      currentGame.buzzerProcessTimeout = null;
    }, remainingWait);
  }

  selectFromTie(game, tiedBuzzes) {
    const tiedPlayerIds = tiedBuzzes.map(b => b.playerId);
    
    // First, try to pick from "not picked" list
    const notPickedInTies = game.notPickedInTies || [];
    const notPickedInTie = tiedPlayerIds.filter(id => notPickedInTies.includes(id));

    let selectedPlayerId = null;

    if (notPickedInTie.length > 0) {
      // Pick the first one from not-picked list (they get priority)
      selectedPlayerId = notPickedInTie[0];
      // Remove from not-picked list since they're being picked now
      game.notPickedInTies = game.notPickedInTies.filter(id => id !== selectedPlayerId);
    } else {
      // No one in not-picked list, pick first in tie
      selectedPlayerId = tiedPlayerIds[0];
    }

    // Add all other tied players to "not picked" list (if not already there)
    tiedPlayerIds.forEach(playerId => {
      if (playerId !== selectedPlayerId && !game.notPickedInTies.includes(playerId)) {
        game.notPickedInTies.push(playerId);
      }
    });

    return selectedPlayerId;
  }

  computeResolvedBuzzerOrder(game) {
    // Resolved order: currentPlayer first (if exists), then others in original buzzerOrder
    if (!game.currentPlayer) {
      return game.buzzerOrder;
    }
    
    const resolved = [game.currentPlayer];
    game.buzzerOrder.forEach(playerId => {
      if (playerId !== game.currentPlayer) {
        resolved.push(playerId);
      }
    });
    
    return resolved;
  }

  logBuzzerDebug(game, tiedBuzzes, selectedPlayerId) {
    const playerNames = {};
    game.players.forEach((player, id) => {
      playerNames[id] = player.name;
    });

    const TIE_WINDOW_MS = 250;
    const firstServerTime = game.buzzTimestamps[0]?.serverTimestamp || 0;

    console.log('\n=== BUZZER DEBUG INFO ===');
    console.log(`Total buzzes: ${game.buzzTimestamps.length}`);
    
    game.buzzTimestamps.forEach((buzz, index) => {
      const latency = buzz.serverTimestamp - buzz.clientTimestamp;
      const isTied = tiedBuzzes.some(tb => tb.playerId === buzz.playerId);
      const isSelected = buzz.playerId === selectedPlayerId;
      const timeFromFirst = buzz.serverTimestamp - firstServerTime;
      const isLate = timeFromFirst > TIE_WINDOW_MS;
      
      console.log(
        `${index + 1}. ${playerNames[buzz.playerId] || buzz.playerId} | ` +
        `Client: ${buzz.clientTimestamp} | ` +
        `Server: ${buzz.serverTimestamp} | ` +
        `Latency: ${latency}ms | ` +
        `Time from first: ${timeFromFirst}ms | ` +
        `${isTied ? 'TIED' : isLate ? 'LATE (not counted)' : ''} ${isSelected ? '✓ SELECTED' : ''}`
      );
    });

    if (tiedBuzzes.length > 1) {
      console.log(`\nTIE DETECTED (${tiedBuzzes.length} players within 250ms):`);
      tiedBuzzes.forEach(buzz => {
        console.log(`  - ${playerNames[buzz.playerId] || buzz.playerId}`);
      });
      console.log(`Selected: ${playerNames[selectedPlayerId] || selectedPlayerId}`);
    }

    const lateBuzzes = game.buzzTimestamps.filter(
      b => (b.serverTimestamp - firstServerTime) > TIE_WINDOW_MS
    );
    if (lateBuzzes.length > 0) {
      console.log(`\nLATE BUZZES (outside 250ms window, shown but not counted):`);
      lateBuzzes.forEach(buzz => {
        console.log(`  - ${playerNames[buzz.playerId] || buzz.playerId}`);
      });
    }

    console.log(`\nNot-picked list: ${(game.notPickedInTies || []).map(id => playerNames[id] || id).join(', ') || '(empty)'}`);
    console.log('=== END BUZZER DEBUG ===\n');
  }

  judgeAnswer(roomId, playerId, correct) {
    const game = this.games.get(roomId);
    if (!game || !game.selectedClue || !game.config) return false;

    // Check if player has already been judged
    if (game.judgedPlayers.includes(playerId)) {
      return false; // Already judged
    }

    const round = game.currentRound === "jeopardy" 
      ? game.config.jeopardy 
      : game.config.doubleJeopardy;

    const category = round.categories.find(c => c.id === game.selectedClue.categoryId);
    if (!category) return false;

    const clue = category.clues.find(c => c.id === game.selectedClue.clueId);
    if (!clue) return false;

    const player = game.players.get(playerId);
    if (!player) return false;

    // Mark player as judged
    game.judgedPlayers.push(playerId);

    if (correct) {
      player.score += clue.value;
      clue.answered = true;
      // Track who last answered correctly (they have control of the board)
      game.lastCorrectPlayer = playerId;
      console.log(`Last correct player: ${game.lastCorrectPlayer}`);
      // Correct answer - stay in judging state, don't auto-advance
      // Host can manually go back to board
    } else {
      player.score -= clue.value;
      // Move to next player in display buzzer order who hasn't been judged
      // Use displayBuzzerOrder (static order) to find next player, fallback to resolvedBuzzerOrder or buzzerOrder
      const orderToUse = game.displayBuzzerOrder && game.displayBuzzerOrder.length > 0
        ? game.displayBuzzerOrder
        : (game.resolvedBuzzerOrder && game.resolvedBuzzerOrder.length > 0 
          ? game.resolvedBuzzerOrder 
          : game.buzzerOrder);
      const currentIndex = orderToUse.indexOf(playerId);
      let nextPlayerId = null;
      
      // Find the next player in display order who hasn't been judged
      for (let i = currentIndex + 1; i < orderToUse.length; i++) {
        const candidateId = orderToUse[i];
        if (!game.judgedPlayers.includes(candidateId)) {
          nextPlayerId = candidateId;
          break;
        }
      }
      
      if (nextPlayerId) {
        game.currentPlayer = nextPlayerId;
        game.status = "answering";
        // Update resolved order with new current player (for logic)
        game.resolvedBuzzerOrder = this.computeResolvedBuzzerOrder(game);
        // Keep displayBuzzerOrder unchanged - it should never change after initial set
      } else {
        // No more eligible players, stay in judging state
        game.currentPlayer = null;
        game.resolvedBuzzerOrder = game.buzzerOrder;
        // Keep displayBuzzerOrder unchanged
      }
    }

    return true;
  }

  updateScore(roomId, playerId, delta) {
    const game = this.games.get(roomId);
    if (!game) return false;

    const player = game.players.get(playerId);
    if (!player) return false;

    player.score += delta;
    return true;
  }

  nextRound(roomId) {
    const game = this.games.get(roomId);
    if (!game) return false;

    if (game.currentRound === "jeopardy") {
      game.currentRound = "doubleJeopardy";
      game.status = "selecting";
      game.selectedClue = null;
      game.buzzerOrder = [];
      game.currentPlayer = null;
      game.lastCorrectPlayer = null; // Reset control for new round
    } else if (game.currentRound === "doubleJeopardy") {
      // Allow advancing to Final Jeopardy (for testing, skip all clues answered check)
      this.initializeFinalJeopardy(roomId);
    }

    return true;
  }

  initializeFinalJeopardy(roomId) {
    const game = this.games.get(roomId);
    if (!game) return false;

    game.currentRound = "finalJeopardy";
    game.status = "finalJeopardyWagering";
    
    // Capture initial scores and create judging order (ascending by score)
    game.finalJeopardyInitialScores = new Map();
    game.finalJeopardyJudgingOrder = [];
    
    // Get all players with their scores, sort by score (ascending)
    const playersWithScores = Array.from(game.players.entries()).map(([id, player]) => ({
      id,
      score: player.score
    }));
    
    playersWithScores.sort((a, b) => a.score - b.score);
    
    // Store initial scores and create judging order
    playersWithScores.forEach(({ id, score }) => {
      game.finalJeopardyInitialScores.set(id, score);
      game.finalJeopardyJudgingOrder.push(id);
    });
    
    // Reset Final Jeopardy state
    game.finalJeopardyClueShown = false;
    game.finalJeopardyCountdownStart = null;
    game.finalJeopardyCountdownEnd = null;
    game.finalJeopardyJudgingPlayerIndex = null;
    game.finalJeopardyRevealedWager = false;
    game.finalJeopardyRevealedAnswer = false;
    
    // Clear any existing wagers/answers
    game.players.forEach(player => {
      player.finalJeopardyWager = undefined;
      player.finalJeopardyAnswer = undefined;
    });
    
    return true;
  }

  allCluesAnswered(game) {
    if (!game.config) return false;

    const round = game.currentRound === "jeopardy" 
      ? game.config.jeopardy 
      : game.config.doubleJeopardy;

    return round.categories.every(category =>
      category.clues.every(clue => clue.revealed && clue.answered)
    );
  }

  startFinalJeopardy(roomId) {
    const game = this.games.get(roomId);
    if (!game) return false;

    // Allow starting Final Jeopardy from doubleJeopardy (for testing)
    if (game.currentRound === "doubleJeopardy") {
      this.initializeFinalJeopardy(roomId);
      return true;
    } else if (game.currentRound === "finalJeopardy") {
      game.status = "finalJeopardyWagering";
      return true;
    }

    return false;
  }

  submitWager(roomId, playerId, wager) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyWagering") return false;

    const player = game.players.get(playerId);
    if (!player) return false;

    // Only allow players with score > 0 to wager
    if (player.score <= 0) return false;

    if (wager < 0 || wager > player.score) return false;

    player.finalJeopardyWager = wager;

    // Don't auto-advance - host will manually show clue when ready
    return true;
  }

  showFinalJeopardyClue(roomId) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyWagering") return false;

    // Check if all eligible players (score > 0) have wagered
    const eligiblePlayers = Array.from(game.players.values()).filter(p => p.score > 0);
    const allEligibleWagered = eligiblePlayers.every(p => p.finalJeopardyWager !== undefined);
    
    if (!allEligibleWagered) return false;

    game.finalJeopardyClueShown = true;
    game.status = "finalJeopardyAnswering";
    
    // Start countdown timer (30 seconds)
    const now = Date.now();
    game.finalJeopardyCountdownStart = now;
    game.finalJeopardyCountdownEnd = now + 30000; // 30 seconds
    
    // Set timeout to lock answers after 30 seconds
    setTimeout(() => {
      this.lockFinalJeopardyAnswers(roomId);
    }, 30000);
    
    return true;
  }

  lockFinalJeopardyAnswers(roomId) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyAnswering") return;
    
    // Answers are now locked - no more submissions allowed
    // Status will change when host starts judging
  }

  submitFinalAnswer(roomId, playerId, answer) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyAnswering") return false;

    // Check if countdown has expired
    if (game.finalJeopardyCountdownEnd && Date.now() > game.finalJeopardyCountdownEnd) {
      return false; // Countdown expired, answers are locked
    }

    const player = game.players.get(playerId);
    if (!player) return false;

    player.finalJeopardyAnswer = answer;

    // Don't auto-advance - host will manually start judging when ready
    return true;
  }

  startFinalJeopardyJudging(roomId) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyAnswering") return false;

    if (!game.finalJeopardyJudgingOrder || game.finalJeopardyJudgingOrder.length === 0) {
      return false;
    }

    game.status = "finalJeopardyJudging";
    game.finalJeopardyJudgingPlayerIndex = 0;
    game.finalJeopardyRevealedWager = false;
    game.finalJeopardyRevealedAnswer = false;

    return true;
  }

  revealFinalJeopardyWager(roomId) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyJudging") return false;

    if (game.finalJeopardyRevealedWager) return false; // Already revealed

    game.finalJeopardyRevealedWager = true;
    return true;
  }

  revealFinalJeopardyAnswer(roomId) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyJudging") return false;

    if (!game.finalJeopardyRevealedWager) return false; // Must reveal wager first
    if (game.finalJeopardyRevealedAnswer) return false; // Already revealed

    game.finalJeopardyRevealedAnswer = true;
    return true;
  }

  judgeFinalJeopardyAnswer(roomId, playerId, correct) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyJudging") return false;

    if (!game.finalJeopardyJudgingOrder || game.finalJeopardyJudgingPlayerIndex === undefined) {
      return false;
    }

    const currentPlayerId = game.finalJeopardyJudgingOrder[game.finalJeopardyJudgingPlayerIndex];
    if (currentPlayerId !== playerId) return false; // Not the current player being judged

    if (!game.finalJeopardyRevealedWager || !game.finalJeopardyRevealedAnswer) {
      return false; // Must reveal both wager and answer before judging
    }

    const player = game.players.get(playerId);
    if (!player || player.finalJeopardyWager === undefined) return false;

    const clue = game.config?.finalJeopardy;
    if (!clue) return false;

    // Apply wager (add if correct, subtract if incorrect)
    if (correct) {
      player.score += player.finalJeopardyWager;
    } else {
      player.score -= player.finalJeopardyWager;
    }

    // Move to next player
    game.finalJeopardyJudgingPlayerIndex++;
    
    if (game.finalJeopardyJudgingPlayerIndex >= game.finalJeopardyJudgingOrder.length) {
      // All players judged, game is finished
      game.status = "finished";
    } else {
      // Reset reveal flags for next player
      game.finalJeopardyRevealedWager = false;
      game.finalJeopardyRevealedAnswer = false;
    }

    return true;
  }

  revealFinalAnswers(roomId) {
    const game = this.games.get(roomId);
    if (!game || !game.config || game.status !== "finalJeopardyReveal") return false;

    const correctAnswer = game.config.finalJeopardy.answer.toLowerCase().trim();
    
    game.players.forEach(player => {
      if (player.finalJeopardyWager !== undefined) {
        const playerAnswer = (player.finalJeopardyAnswer || "").toLowerCase().trim();
        const isCorrect = playerAnswer === correctAnswer;
        
        if (isCorrect) {
          player.score += player.finalJeopardyWager;
        } else {
          player.score -= player.finalJeopardyWager;
        }
      }
    });

    game.status = "finished";
    return true;
  }

  returnToBoard(roomId) {
    const game = this.games.get(roomId);
    if (!game) return false;

    // Reset to selecting state, clearing any selected clue
    game.status = "selecting";
    game.selectedClue = null;
    game.currentPlayer = null;
    game.buzzerOrder = [];
    game.resolvedBuzzerOrder = [];
    game.displayBuzzerOrder = [];
    game.buzzTimestamps = [];
    game.judgedPlayers = [];
    // Note: We keep notPickedInTies across clues for fairness
    
    return true;
  }

  startGame(roomId) {
    const game = this.games.get(roomId);
    if (!game || !game.config) return false;

    if (game.status === "ready") {
      game.status = "selecting";
      return true;
    }

    return false;
  }
}

const gameManager = new GameManager();

module.exports = { gameManager };

