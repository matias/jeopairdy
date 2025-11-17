const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

// Get list of saved games
router.get('/list', async (req, res) => {
  try {
    const testDataDir = path.join(__dirname, '../../test-data');
    const files = await fs.readdir(testDataDir);
    const gameFiles = files.filter((f) => f.endsWith('.json'));

    const games = await Promise.all(
      gameFiles.map(async (file) => {
        const filePath = path.join(testDataDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const game = JSON.parse(content);
        return {
          id: game.id,
          createdAt: game.createdAt,
          filename: file,
        };
      }),
    );

    res.json(games);
  } catch (error) {
    console.error('Error listing games:', error);
    res.status(500).json({ error: 'Failed to list games' });
  }
});

// Load a specific game
router.get('/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const filePath = path.join(__dirname, '../../test-data', `${gameId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    const game = JSON.parse(content);
    res.json(game);
  } catch (error) {
    console.error('Error loading game:', error);
    res.status(404).json({ error: 'Game not found' });
  }
});

module.exports = router;
