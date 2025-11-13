// Load environment variables from .env.local or .env
// dotenv.config() loads .env by default, but we want to prioritize .env.local
const fs = require('fs');
const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env';
require('dotenv').config({ path: envPath });

const express = require('express');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// CORS configuration
// In development, allow all origins for local network access
// In production, use specific origin from env var
const corsOptions = process.env.NODE_ENV === 'production'
  ? {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    }
  : {
      origin: true, // Allow all origins in development
      credentials: true,
    };

app.use(cors(corsOptions));

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

// Listen on all interfaces (0.0.0.0) to allow connections from local network
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT} (accessible from all network interfaces)`);
});

