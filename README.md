# Jeopairdy

![Status](https://img.shields.io/badge/status-active%20development-yellow)

A live, web-based Jeopardy!-style trivia game with AI-generated questions based on themes/prompt chosen by the host. The host creates and controls the game and judges answers. Meant to be played either together (in a room) or over a video call, with the host presenting the "game view".

Because the clues and answers are AI-generated, they can be made to be about any topic(s) of your choice!

Currently implements the basic game flow of an initial round, a double Jeopardy round, and a Final Jeopardy with wagers.

> **⚠️ Status**: This project is in active development and may contain bugs. Use at your own risk.

> Vibe-coded on Cursor using a mix of Composer 1, Claude Sonnet 4.5, ChatGPT 5.1 Codex, and good ol' human ingenuity.

> This project was also inspired by [howardchung/jeopardy](https://github.com/howardchung/jeopardy), a web-based Jeopardy! game for playing with friends online, and borrows fonts and sound files from that repo.

## Features

- **Live Gameplay**: Play in real-time with a host and multiple players
- **AI-Generated Questions**: Uses OpenAI GPT-5.1 or Google Gemini 3.0 Pro (bring your own API keys) to generate custom games through an interactive co-creation flow
- **Three Rounds**: Jeopardy, Double Jeopardy, and Final Jeopardy
- **Real-time Buzzer System**: Server-timestamped buzzes for accurate buzzer order, with a fair(ish) tie-breaking mechanism
- **Multiple Views**:
  - Host control view for managing the game
  - Game display view for TV/screen projection
  - Player buzzer view for mobile devices
- **QR Code Joining**: Players can scan QR codes to join games
- **Game Persistence**: Save and load game configs (clues and answers)
- **Cloud-Native**: Runs entirely on Firebase/Firestore with no separate server needed

## Tech Stack

- **Frontend**: Next.js 15 (React + TypeScript)
- **Backend**: Firebase Firestore (real-time database)
- **Authentication**: Firebase Anonymous Auth + Google Sign-In (for hosts)
- **AI**: OpenAI GPT-5.1 API (Conversations API) or Google Gemini 3.0 Pro API
- **Styling**: Tailwind CSS
- **Hosting**: Vercel (recommended) or any Next.js-compatible host

## Requirements

- **Minimum 3 players**: 1 host + 2+ competitors
- **Each player needs their own device**: Host uses a computer/tablet, players use phones/tablets, and a separate screen/TV for the game display
- **Internet access**: All devices need internet connectivity

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
cp .env.example .env.local
```

Add your configuration:

```env
# AI API Keys (at least one is required)
OPENAI_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here

# Firebase Configuration (get from Firebase Console)
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id

# Optional: Restrict who can host games (comma-separated emails)
NEXT_PUBLIC_HOST_ALLOWLIST=host1@example.com,host2@example.com
```

You can use either OpenAI or Gemini, or both. The create-game interface allows you to choose which model to use.

### Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Firestore Database** in production mode
3. Enable **Anonymous Authentication** under Authentication > Sign-in method
4. Enable **Google Sign-In** under Authentication > Sign-in method (for host authentication)
5. Add a Web App and copy the config values to `.env.local`
6. Deploy security rules:

```bash
firebase deploy --only firestore:rules
```

### Running Locally

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

### Deployment

The app is designed to be deployed on Vercel:

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy

The app works with any Next.js-compatible hosting platform.

## Usage

### Hosting a Game

1. **Sign In**:
   - Go to the home page and sign in with Google
   - Only users on the allowlist (if configured) can host games

2. **Create a Game Room**:
   - Click "Host Game" on the home page
   - You'll be automatically redirected to `/host/[roomId]` with a 4-character room code
   - Share the room code or QR code with players

3. **Create a Game (Co-Creation Flow)**:
   - From the host page, click "Create New Game" to go to `/create-game`
   - **Enter game parameters**:
     - Topics/Prompt: Describe themes or constraints (e.g., "1990s pop culture", "World War II leadership")
     - Difficulty: Easy, Medium, or Hard
     - Source Material (optional): Paste reference text or context
     - AI Model: Choose between ChatGPT 5.1 or Gemini 3.0 Pro
     - Google Search Grounding (Gemini only): Enable web search for real-time information
   - **Generate samples**: Click "Generate Samples" to see sample categories and clues
   - **Iterate with feedback**:
     - Review the AI's commentary and sample categories
     - Provide feedback in the feedback box (e.g., "make it harder", "add more science questions")
     - Click "Regenerate with Feedback" to refine
     - Repeat until satisfied
   - **Finalize**: Click "Finalize Game" to generate full Jeopardy, Double Jeopardy, and Final Jeopardy rounds
   - **Edit (optional)**: Review and edit individual clues/answers before saving
   - **Save**: Click "SAVE GAME" to load it into the game room

4. **Load a Saved Game**:
   - From the host page, click "Load Game" to load a previously saved game

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
   - Host reads the clue, then clicks "Unlock Buzzers"
   - Players buzz in when they know the answer
   - Host judges answers and manages scores
   - Game progresses through Jeopardy → Double Jeopardy → Final Jeopardy

## Game Flow

### Setup Phase

1. Host signs in and creates a room
2. Host generates or loads a game
3. Players join the room using the room code
4. Host opens the game display view on a separate screen/TV

### Regular Rounds (Jeopardy & Double Jeopardy)

1. Host selects a clue from the board
2. Clue is revealed with buzzers locked
3. Host reads the clue aloud, then clicks "Unlock Buzzers"
4. 20-second timer starts for players to buzz in
5. Server resolves ties (250ms window) using fairness algorithm
6. Selected player answers
7. Host judges (Correct/Incorrect)
8. If incorrect, next player in buzzer order gets a chance
9. Host returns to board for next clue
10. Host advances to next round when ready

### Final Jeopardy

1. Host initializes Final Jeopardy (only players with score > 0 participate)
2. Players submit wagers (0 to their current score)
3. Host shows the clue (reads it aloud)
4. Host clicks "Start Timer" to begin 60-second countdown
5. Players submit answers within the countdown
6. Host judges players sequentially (lowest score first)
7. For each player: reveal wager → reveal answer → judge → next player
8. Game ends when all players are judged

## Project Structure

```
jeopairdy/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes (AI generation, game loading)
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
├── lib/                   # Client-side utilities
│   ├── firestore-client.ts # Firestore game client
│   ├── firebase.ts        # Firebase initialization
│   ├── game-client-interface.ts # Client interface
│   └── prompts.ts        # AI prompt builders for co-creation
├── shared/                # Shared TypeScript types
│   └── types.ts          # Game state and message types
└── firestore.rules       # Firebase security rules
```

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required for ChatGPT 5.1)
- `GEMINI_API_KEY`: Your Google Gemini API key (required for Gemini 3.0 Pro)
- `NEXT_PUBLIC_FIREBASE_*`: Firebase configuration (required)
- `NEXT_PUBLIC_HOST_ALLOWLIST`: Comma-separated list of emails allowed to host (optional)
- `SLACK_WEBHOOK_URL`: Slack webhook for game notifications (optional)

**Note**: At least one API key (`OPENAI_API_KEY` or `GEMINI_API_KEY`) is required. You can use both if you want to switch between models.

## How Game Creation Works

The game uses an **interactive co-creation flow** with either ChatGPT 5.1 or Gemini 3.0 Pro:

1. **Sample Generation**: Host provides topics, difficulty, and optional source material. The AI generates sample categories with a few example clues.

2. **Iterative Refinement**: Host reviews samples and provides feedback. The AI regenerates samples incorporating the feedback. This process maintains conversation state, so the AI remembers previous iterations.

3. **Finalization**: When satisfied, the host requests full rounds. The client sequentially generates:
   - Jeopardy round (5 categories × 5 clues)
   - Double Jeopardy round (5 categories × 5 clues, excluding answers from Jeopardy)
   - Final Jeopardy (single clue)

4. **Editing**: Host can review and edit individual clues/answers before saving.

5. **Deployment**: The completed game config is saved to Firestore and loaded into the game room.

All iterative samples remain client-side for rapid experimentation; only the final `GameConfig` is saved to Firestore.

## License

MIT License - see [LICENSE](LICENSE) file for details.
