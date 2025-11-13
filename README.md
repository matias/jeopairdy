# Jeopairdy

A live, web-based Jeopardy!-style trivia game with AI-generated questions.

## Features

- **Live Gameplay**: Play in real-time with a host and multiple players
- **AI-Generated Questions**: Uses OpenAI GPT-5 to generate custom games
- **Three Rounds**: Jeopardy, Double Jeopardy, and Final Jeopardy
- **Real-time Buzzer System**: Client-side timestamping for accurate buzzer order
- **Multiple Views**: 
  - Host control view for managing the game
  - Game display view for TV/screen projection
  - Player buzzer view for mobile devices
- **QR Code Joining**: Players can scan QR codes to join games
- **Game Persistence**: Save and load games as JSON files

## Tech Stack

- **Frontend**: Next.js 15 (React + TypeScript)
- **Backend**: Node.js + Express
- **Real-time**: WebSockets (native `ws` library)
- **AI**: OpenAI GPT-5 API
- **Styling**: Tailwind CSS

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

Add your OpenAI API key:
```
OPENAI_API_KEY=your_key_here
```

3. Start the development server:
```bash
npm run dev
```

4. Start the backend server (in a separate terminal):
```bash
npm run server
```

The app will be available at `http://localhost:3000` and the backend at `http://localhost:3001`.

## Usage

1. **Create a Game Room**: 
   - Go to `/create` to create a new room
   - Share the 4-character room code or QR code with players

2. **Join as Host**:
   - The creator automatically becomes the host
   - Go to `/host/[roomId]` to access host controls
   - Create a new game with AI or load a saved game

3. **Join as Player**:
   - Go to `/join` and enter the room code
   - Or scan the QR code from the create page
   - Use your device as a buzzer

4. **Game Display**:
   - Go to `/game/[roomId]` to display the game on a TV/screen
   - This view shows the board and clues for all players to see

## Game Flow

1. Host creates/loads a game
2. Players join the room
3. Host selects clues from the board
4. Players buzz in to answer
5. Host judges answers and manages scores
6. Game progresses through Jeopardy → Double Jeopardy → Final Jeopardy
7. Player with highest score wins

## Project Structure

```
jeopairdy/
├── app/                    # Next.js app router pages
│   ├── create/            # Create game room
│   ├── join/              # Join game room
│   ├── host/[roomId]/     # Host control view
│   ├── game/[roomId]/     # Game display view
│   └── player/[roomId]/   # Player buzzer view
├── components/            # React components
│   ├── GameBoard/        # Jeopardy board
│   ├── ClueDisplay/       # Clue/question display
│   ├── Buzzer/           # Player buzzer
│   └── Scoreboard/       # Score display
├── server/                # Backend server
│   ├── src/
│   │   ├── game/         # Game state management
│   │   ├── websocket/   # WebSocket handlers
│   │   ├── ai/           # AI question generation
│   │   └── routes/       # REST API routes
│   └── test-data/        # Saved game JSON files
├── shared/                # Shared TypeScript types
└── lib/                   # Client-side utilities
```

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required for AI generation)
- `PORT`: Backend server port (default: 3001)
- `NEXT_PUBLIC_WS_URL`: WebSocket URL (default: ws://localhost:3001)
- `NEXT_PUBLIC_API_URL`: API URL (default: http://localhost:3001)

## Deployment

The app is designed to be deployed on Render:
- Frontend and backend can run on the same Render web service
- WebSocket support is available on Render's free tier
- Set environment variables in Render dashboard

## License

MIT

