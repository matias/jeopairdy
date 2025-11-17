# Jeopairdy

![Status](https://img.shields.io/badge/status-active%20development-yellow)

A live, web-based Jeopardy!-style trivia game with AI-generated questions. A host controls the game and judges answers. Meant to be played either together (in a room) or over a video call, with the host presenting the "game view".

Because the clues and answers are AI-generated, they can be made to be about any topic(s) of your choice!

Currently implements the basic game flow of an initial round, a double Jeopardy round, and a Final Jeopardy with wagers.

> **⚠️ Status**: This project is in active development and may contain bugs. Use at your own risk.

> This project was inspired by [howardchung/jeopardy](https://github.com/howardchung/jeopardy), a web-based Jeopardy! game for playing with friends online, and borrows fonts and sound files from that repo.

## Features

- **Live Gameplay**: Play in real-time with a host and multiple players
- **AI-Generated Questions**: Uses OpenAI GPT-5.1 (bring your own API key) to generate custom games through an interactive co-creation flow
- **Three Rounds**: Jeopardy, Double Jeopardy, and Final Jeopardy
- **Real-time Buzzer System**: Client-side timestamping for accurate buzzer order, with a fair(ish) tie-breaking mechanism.
- **Multiple Views**: 
  - Host control view for managing the game
  - Game display view for TV/screen projection
  - Player buzzer view for mobile devices
- **QR Code Joining**: Players can scan QR codes to join games
- **Game Persistence**: Save and load game configs (clues and answers) as JSON files

## Tech Stack

- **Frontend**: Next.js 15 (React + TypeScript)
- **Backend**: Node.js + Express
- **Real-time**: WebSockets (native `ws` library)
- **AI**: OpenAI GPT-5.1 API (Conversations API)
- **Styling**: Tailwind CSS

## Requirements

- **Minimum 3 players**: 1 host + 2+ competitors
- **Each player needs their own device**: Host uses a computer/tablet, players use phones/tablets, and a separate screen/TV for the game display
- **All devices must be on the same network** (for local play) or have internet access (for cloud deployment)

## Setup

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd jeopairdy
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Add your OpenAI API key:
```
OPENAI_API_KEY=your_key_here
```

### Running Locally

1. Start the development server (in one terminal):
```bash
npm run dev
```

2. Start the backend server (in a separate terminal):
```bash
npm run server
```

The app will be available at `http://localhost:3000` and the backend at `http://localhost:3001`.

### Running on Local Network

To allow players on the same Wi-Fi network to join:

1. Find your computer's local IP address:
   - **macOS/Linux**: Run `ifconfig` or `ip addr` and look for your Wi-Fi adapter's IP (usually starts with `192.168.` or `10.`)
   - **Windows**: Run `ipconfig` and look for "IPv4 Address"

2. Update environment variables (or set them when running):
   - `NEXT_PUBLIC_WS_URL=ws://YOUR_LOCAL_IP:3001`
   - `NEXT_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3001`

3. Start both servers as described above

4. Players can access the game at `http://YOUR_LOCAL_IP:3000`

### Cloud Deployment

The app can be deployed to cloud hosting, but specific deployment instructions are not yet documented. Requirements for cloud deployment:

- **WebSocket support**: The hosting provider must support WebSocket connections (e.g., Render, Railway, Fly.io)
- **Environment variables**: Set `OPENAI_API_KEY`, `NEXT_PUBLIC_WS_URL`, and `NEXT_PUBLIC_API_URL` in your hosting dashboard
- **Port configuration**: Ensure both frontend and backend ports are properly configured

Note: The app is designed to work on Render's free tier, which supports WebSockets.

## Usage

### Hosting a Game

1. **Create a Game Room**: 
   - Go to `/create` (or click "Host Game" on the home page)
   - You'll be automatically redirected to `/host/[roomId]` with a 4-character room code
   - Share the room code or QR code with players

2. **Create a Game (Co-Creation Flow)**:
   - From the host page, click "Create New Game" to go to `/create-game`
   - **Enter game parameters**:
     - Topics/Prompt: Describe themes or constraints (e.g., "1990s pop culture", "World War II leadership")
     - Difficulty: Easy, Medium, or Hard
     - Source Material (optional): Paste reference text or context
   - **Generate samples**: Click "Generate Samples" to see sample categories and clues
   - **Iterate with feedback**: 
     - Review the AI's commentary and sample categories
     - Provide feedback in the feedback box (e.g., "make it harder", "add more science questions")
     - Click "Regenerate with Feedback" to refine
     - Repeat until satisfied
   - **Finalize**: Click "Finalize Game" to generate full Jeopardy, Double Jeopardy, and Final Jeopardy rounds
   - **Edit (optional)**: Review and edit individual clues/answers before saving
   - **Save**: Click "SAVE GAME" to load it into the game room

3. **Load a Saved Game**:
   - From the host page, click "Load Game" to load a previously saved game from JSON files

### Playing a Game

1. **Join as Player**:
   - Go to `/join` (or click "Join Game" on the home page)
   - Enter the 4-character room code
   - Or scan the QR code from the host's screen
   - Use your device as a buzzer

2. **Game Display**:
   - Go to `/game/[roomId]` to display the game on a TV/screen
   - This view shows the board and clues for all players to see
   - Open this on a separate device/screen from the host's control view

3. **Gameplay**:
   - Host selects clues from the board
   - Players buzz in when they know the answer
   - Host judges answers and manages scores
   - Game progresses through Jeopardy → Double Jeopardy → Final Jeopardy

## Game Flow

### Setup Phase
1. Host creates a room and generates/loads a game
2. Players join the room using the room code
3. Host opens the game display view on a separate screen/TV

### Regular Rounds (Jeopardy & Double Jeopardy)
1. Host selects a clue from the board
2. Clue is revealed with a 3-second buzzer lock
3. Buzzer unlocks and players can buzz in
4. Server resolves ties (250ms window) using fairness algorithm
5. Selected player answers
6. Host judges (Correct/Incorrect)
7. If incorrect, next player in buzzer order gets a chance
8. Host returns to board for next clue
9. Host advances to next round when ready

### Final Jeopardy
1. Host initializes Final Jeopardy (only players with score > 0 participate)
2. Players submit wagers (0 to their current score)
3. Host shows the clue and starts 30-second countdown
4. Players submit answers within the countdown
5. Host judges players sequentially (lowest score first)
6. For each player: reveal wager → reveal answer → judge → next player
7. Game ends when all players are judged

## Project Structure

```
jeopairdy/
├── app/                    # Next.js app router pages
│   ├── create/            # Create game room (redirects to host)
│   ├── create-game/       # Interactive game co-creation interface
│   ├── load-game/         # Load saved game
│   ├── join/              # Join game room
│   ├── host/[roomId]/     # Host control view
│   ├── game/[roomId]/     # Game display view (TV/screen)
│   └── player/[roomId]/   # Player buzzer view
├── components/            # React components
│   ├── GameBoard/        # Jeopardy board
│   ├── ClueDisplay/       # Clue/question display
│   ├── Buzzer/           # Player buzzer
│   └── Scoreboard/       # Score display
├── server/                # Backend server
│   ├── src/
│   │   ├── game/         # Game state management (GameManager)
│   │   ├── websocket/    # WebSocket handlers
│   │   ├── ai/           # AI question generation (legacy, unused)
│   │   └── routes/       # REST API routes
│   └── test-data/        # Saved game JSON files
├── shared/                # Shared TypeScript types
│   └── types.ts          # Game state and message types
└── lib/                   # Client-side utilities
    ├── websocket.ts      # WebSocket client
    ├── websocket-url.ts  # WebSocket URL configuration
    └── prompts.ts        # AI prompt builders for co-creation
```

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required for AI generation)
- `PORT`: Backend server port (default: 3001)
- `NEXT_PUBLIC_WS_URL`: WebSocket URL (default: `ws://localhost:3001` for local, or `ws://YOUR_IP:3001` for local network)
- `NEXT_PUBLIC_API_URL`: API URL (default: `http://localhost:3001` for local, or `http://YOUR_IP:3001` for local network)

## How Game Creation Works

The game uses an **interactive co-creation flow** with GPT-5.1:

1. **Sample Generation**: Host provides topics, difficulty, and optional source material. The AI generates sample categories with a few example clues.

2. **Iterative Refinement**: Host reviews samples and provides feedback. The AI regenerates samples incorporating the feedback. This process maintains conversation state, so the AI remembers previous iterations.

3. **Finalization**: When satisfied, the host requests full rounds. The client sequentially generates:
   - Jeopardy round (5 categories × 5 clues)
   - Double Jeopardy round (5 categories × 5 clues, excluding answers from Jeopardy)
   - Final Jeopardy (single clue)

4. **Editing**: Host can review and edit individual clues/answers before saving.

5. **Deployment**: The completed game config is sent to the game server and loaded into the room.

All iterative samples remain client-side for rapid experimentation; only the final `GameConfig` is sent to the server.

## Deployment

The app is designed to be deployed on Render:
- Frontend and backend can run on the same Render web service
- WebSocket support is available on Render's free tier
- Set environment variables in Render dashboard

**Note**: Specific cloud deployment instructions are not yet documented. The server must support WebSocket connections for real-time gameplay.

## License

MIT License - see [LICENSE](LICENSE) file for details.

