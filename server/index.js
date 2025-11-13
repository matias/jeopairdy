const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../.next')));

// Import WebSocket handler
const { handleWebSocket } = require('./src/websocket/server');

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  handleWebSocket(ws, req);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Game routes
const gamesRouter = require('./src/routes/games');
app.use('/api/games', gamesRouter);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

