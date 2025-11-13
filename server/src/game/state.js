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
      currentPlayer: null,
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
    game.status = "selecting";
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
    game.currentPlayer = null;

    // Unlock buzzer after a delay (simulate reading time)
    setTimeout(() => {
      const currentGame = this.games.get(roomId);
      if (currentGame && currentGame.status === "clueRevealed") {
        currentGame.status = "buzzing";
      }
    }, 3000); // 3 second delay

    return true;
  }

  handleBuzz(roomId, playerId, timestamp) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "buzzing") return false;

    // Check if player exists
    if (!game.players.has(playerId)) return false;

    // Check if already buzzed
    if (game.buzzerOrder.includes(playerId)) return false;

    // Add to buzzer order
    game.buzzerOrder.push(playerId);
    
    // If first to buzz, set as current player
    if (game.buzzerOrder.length === 1) {
      game.currentPlayer = playerId;
      game.status = "answering";
      const player = game.players.get(playerId);
      if (player) {
        player.buzzedAt = timestamp;
      }
    }

    return true;
  }

  judgeAnswer(roomId, playerId, correct) {
    const game = this.games.get(roomId);
    if (!game || !game.selectedClue || !game.config) return false;

    const round = game.currentRound === "jeopardy" 
      ? game.config.jeopardy 
      : game.config.doubleJeopardy;

    const category = round.categories.find(c => c.id === game.selectedClue.categoryId);
    if (!category) return false;

    const clue = category.clues.find(c => c.id === game.selectedClue.clueId);
    if (!clue) return false;

    const player = game.players.get(playerId);
    if (!player) return false;

    if (correct) {
      player.score += clue.value;
      clue.answered = true;
    } else {
      player.score -= clue.value;
      // Move to next player in buzzer order
      const currentIndex = game.buzzerOrder.indexOf(playerId);
      if (currentIndex < game.buzzerOrder.length - 1) {
        game.currentPlayer = game.buzzerOrder[currentIndex + 1];
        game.status = "answering";
      } else {
        // No more players, clue goes unanswered
        game.status = "selecting";
        game.selectedClue = null;
        game.currentPlayer = null;
        game.buzzerOrder = [];
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
    } else if (game.currentRound === "doubleJeopardy") {
      // Check if all clues are answered
      const allAnswered = this.allCluesAnswered(game);
      if (allAnswered) {
        game.currentRound = "finalJeopardy";
        game.status = "finalJeopardyWagering";
      }
    }

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
    if (!game || game.currentRound !== "finalJeopardy") return false;

    game.status = "finalJeopardyWagering";
    return true;
  }

  submitWager(roomId, playerId, wager) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyWagering") return false;

    const player = game.players.get(playerId);
    if (!player) return false;

    if (wager < 0 || wager > player.score) return false;

    player.finalJeopardyWager = wager;

    // Check if all players have wagered
    const allWagered = Array.from(game.players.values()).every(
      p => p.finalJeopardyWager !== undefined
    );

    if (allWagered) {
      game.status = "finalJeopardyAnswering";
    }

    return true;
  }

  submitFinalAnswer(roomId, playerId, answer) {
    const game = this.games.get(roomId);
    if (!game || game.status !== "finalJeopardyAnswering") return false;

    const player = game.players.get(playerId);
    if (!player) return false;

    player.finalJeopardyAnswer = answer;

    // Check if all players have answered
    const allAnswered = Array.from(game.players.values()).every(
      p => p.finalJeopardyAnswer !== undefined
    );

    if (allAnswered) {
      game.status = "finalJeopardyReveal";
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
    
    return true;
  }
}

const gameManager = new GameManager();

module.exports = { gameManager };

