# Jeopairdy Game Architecture

## Overview

Jeopairdy is a Jeopardy!-style trivia game built with Next.js (React) frontend and Firebase Firestore for real-time synchronization. The game supports multiple players competing in real-time with a host controlling the game flow.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Page Components                          │
│  (host/player/game pages - use IGameClient interface)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              createGameClient() Factory                     │
│  (lib/game-client-factory.ts)                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   FirestoreClient                           │
│  (lib/firestore-client.ts - real-time sync via Firestore)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Firebase Firestore                         │
│  (Cloud-hosted real-time database)                          │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

- **`lib/game-client-interface.ts`** - Common interface (`IGameClient`) for the game client
- **`lib/game-client-factory.ts`** - Factory that creates the FirestoreClient
- **`lib/firestore-client.ts`** - Firestore client implementation
- **`lib/firebase.ts`** - Firebase initialization and authentication
- **`firestore.rules`** - Security rules for Firestore

### Environment Variables

Add these to your `.env.local` file:

```env
# Firebase configuration (get from Firebase Console)
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id

# Optional: Restrict who can host games
NEXT_PUBLIC_HOST_ALLOWLIST=host1@example.com,host2@example.com

# AI API keys (at least one required)
OPENAI_API_KEY=your-openai-key
GEMINI_API_KEY=your-gemini-key
```

### Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Firestore Database** in production mode
3. Enable **Anonymous Authentication** under Authentication > Sign-in method
4. Enable **Google Sign-In** under Authentication > Sign-in method (for host authentication)
5. Add a Web App and copy the config values to `.env.local`
6. Deploy security rules: `firebase deploy --only firestore:rules`

### Firestore Data Model

```
games/
└── {roomId}/
    ├── metadata/
    │   └── info          # hostId, createdAt
    ├── config/
    │   └── current       # GameConfig (categories, clues, etc.)
    ├── state/
    │   └── current       # GameState (status, currentPlayer, etc.)
    ├── players/
    │   └── {playerId}/   # Player data (name, score, wagers, etc.)
    └── buzzes/
        └── {buzzId}/     # Buzz records with serverTimestamp

savedGames/
└── {gameId}/             # Saved game configs for reuse
    ├── ...gameConfig
    ├── savedAt
    └── savedBy           # User who saved the game
```

## Core Components

### Client-Side Pages

- **`app/host/[roomId]/page.tsx`** - Host control interface
- **`app/player/[roomId]/page.tsx`** - Player interface with buzzer
- **`app/game/[roomId]/page.tsx`** - Public game display (viewer mode)
- **`app/join/page.tsx`** - Player join page
- **`app/create-game/page.tsx`** - Game creation interface
- **`app/load-game/page.tsx`** - Load saved game

#### Interactive Game Creation Flow

The create-game page orchestrates an iterative chat-driven workflow with GPT-5.1 or Gemini:

1. **Parameter entry:** Host supplies topics, difficulty, and optional source text.
2. **Sample iteration:** Client-side calls to `/api/generate` request sparse sample categories using prompt builders in `lib/prompts.ts`. The host can review rendered categories/clues plus the model's commentary, then submit feedback for additional iterations.
3. **Finalization:** When satisfied, the host requests full rounds. The client sequentially generates Jeopardy, Double Jeopardy (excluding prior answers), and Final Jeopardy JSON payloads, then converts them into a `GameConfig`.
4. **Deployment:** The completed config is saved to Firestore and loaded into the game room.

Only the final `GameConfig` touches Firestore; iterative samples remain client-side for rapid experimentation.

##### Conversation state

- `/api/generate` creates and manages an OpenAI **Conversation** (via the Responses + Conversations APIs). The first sample request spins up a conversation with the system instructions from `lib/prompts.ts`; every subsequent regeneration, round build, or Final Jeopardy request sends only the incremental user message while reusing that conversation ID.
- Because the model retains state, feedback supplied during the sample loop directly influences the final Jeopardy rounds without manually restating previous prompts.

### Shared Types

- **`shared/types.ts`** - TypeScript types for game state and messages

## Game State Structure

### GameStatus Enum

The game progresses through these states:

1. **`waiting`** - Room created, no game loaded
2. **`ready`** - Game loaded, waiting to start
3. **`selecting`** - Host selecting clues from board
4. **`clueRevealed`** - Clue displayed, buzzer locked (host reads clue)
5. **`buzzing`** - Buzzer unlocked (host clicked "Unlock Buzzers"), players can buzz
6. **`answering`** - Player selected (after tie resolution), waiting for answer
7. **`judging`** - Host can judge answer (after revealing answer to players)
8. **`finalJeopardyWagering`** - Final Jeopardy: players placing wagers
9. **`finalJeopardyClueReading`** - Final Jeopardy: host reading clue (before timer)
10. **`finalJeopardyAnswering`** - Final Jeopardy: players writing answers (60s countdown)
11. **`finalJeopardyJudging`** - Final Jeopardy: host judging players sequentially
12. **`finished`** - Game complete

### GameState Object

```typescript
interface GameState {
  roomId: string;
  config: GameConfig | null; // Game questions/categories
  status: GameStatus;
  currentRound: 'jeopardy' | 'doubleJeopardy' | 'finalJeopardy';
  selectedClue: { categoryId: string; clueId: string } | null;
  players: Map<string, Player>;

  // Buzzer management
  buzzerOrder: string[]; // Raw chronological order of all buzzes
  resolvedBuzzerOrder?: string[]; // Order with tie resolution (currentPlayer first)
  displayBuzzerOrder?: string[]; // Static display order (never changes after tie resolution)
  currentPlayer: string | null; // Player currently answering
  judgedPlayers?: string[]; // Players who have been judged for current clue
  buzzerUnlockTime?: number; // Timestamp when buzzers were unlocked

  // Final Jeopardy state
  finalJeopardyInitialScores?: Map<string, number> | Record<string, number>;
  finalJeopardyJudgingOrder?: string[]; // Player IDs sorted by initial score (ascending)
  finalJeopardyClueShown?: boolean;
  finalJeopardyCountdownStart?: number;
  finalJeopardyCountdownEnd?: number; // Timestamp when countdown expires
  finalJeopardyJudgingPlayerIndex?: number;
  finalJeopardyRevealedWager?: boolean;
  finalJeopardyRevealedAnswer?: boolean;

  // Game control
  lastCorrectPlayer?: string | null; // Player with board control
  notPickedInTies?: string[]; // Fairness tracking for tie resolution
  hostId: string;
}
```

## Game Flow

### Regular Rounds (Jeopardy & Double Jeopardy)

1. **Host selects clue** → `selectClue(categoryId, clueId)`
   - Status: `clueRevealed`
   - Buzzer locked
   - Clue displayed on all screens

2. **Host reads clue, then unlocks buzzers** → `unlockBuzzers()`
   - Status: `buzzing`
   - Players can buzz in
   - 20-second timer starts
   - Firestore tracks all buzzes with server timestamps

3. **Tie resolution** (250ms window)
   - All buzzes within 250ms are considered "tied"
   - Host client selects one player using fairness algorithm
   - `currentPlayer` set, `displayBuzzerOrder` created (static)
   - Status: `answering`

4. **Host judges** (can happen immediately, no need to reveal answer first)
   - Host sees judging controls for `currentPlayer`
   - Can mark Correct/Incorrect
   - If incorrect and other players buzzed, next player becomes `currentPlayer`
   - If correct or no more players, host returns to board

5. **Return to board** → `returnToBoard()`
   - Status: `selecting`
   - Clears buzzer state, resets for next clue

### Buzzer Logic Details

**Tie Resolution:**

- 250ms window: all buzzes within 250ms of first buzz are "tied"
- Fairness algorithm: prioritizes players who haven't been picked in previous ties
- `displayBuzzerOrder`: set once when tie resolved, never changes (for UI consistency)
- `resolvedBuzzerOrder`: updated as judging progresses (for logic)

**Late Buzzes:**

- Buzzes after 250ms window are "late" but still shown in UI
- Added to `displayBuzzerOrder` when they arrive
- Can answer if earlier players are judged incorrect

**Judging Multiple Players:**

- When first player judged incorrect, client finds next unjudged player in `displayBuzzerOrder`
- Sets that player as `currentPlayer`
- Host can judge them, repeat until all judged or someone correct

### Final Jeopardy Flow

1. **Initialize Final Jeopardy** → `startFinalJeopardy()`
   - Captures snapshot of player scores → `finalJeopardyInitialScores`
   - Creates judging order (ascending by score) → `finalJeopardyJudgingOrder`
   - Status: `finalJeopardyWagering`
   - Only players with score > 0 can participate

2. **Players wager** → `submitWager(wager)`
   - Client validates: 0 ≤ wager ≤ player.score
   - No auto-advance (host manually shows clue)

3. **Host shows clue** → `showFinalJeopardyClue()`
   - Requires all eligible players to have wagered
   - Status: `finalJeopardyClueReading`
   - Clue displayed, no timer yet
   - Host reads clue aloud

4. **Host starts timer** → `startFinalJeopardyTimer()`
   - Status: `finalJeopardyAnswering`
   - Starts 60-second countdown
   - Sets `finalJeopardyCountdownEnd` timestamp

5. **Players answer** → `submitFinalAnswer(answer)`
   - Client checks if countdown expired
   - Rejects submissions after `finalJeopardyCountdownEnd`
   - No auto-advance (host manually starts judging)

6. **Host starts judging** → `startFinalJeopardyJudging()`
   - Status: `finalJeopardyJudging`
   - Sets `finalJeopardyJudgingPlayerIndex = 0` (lowest score first)

7. **Sequential judging** (for each player in order):
   - `revealFinalJeopardyWager()` - Shows player's wager on game display
   - `revealFinalJeopardyAnswer()` - Shows player's answer on game display
   - `judgeFinalJeopardyAnswer(playerId, correct)` - Applies wager, moves to next player
   - When last player judged, status: `finished`

## Host Controls

### Main Game Controls

- **Select Clue** - Click on game board clue
- **Unlock Buzzers** - Allow players to buzz in (after reading clue)
- **Reveal Answer** - Show answer to players (optional, doesn't block judging)
- **Judge Answer** - Mark current player Correct/Incorrect
- **Back to Board** - Return to clue selection
- **Next Round** - Advance from Jeopardy → Double Jeopardy
- **Start Final Jeopardy** - Advance from Double Jeopardy → Final Jeopardy
- **Manual Score Adjustment** - Adjust any player's score manually

### Final Jeopardy Controls

- **Show Clue** - Reveal clue (requires all eligible players wagered)
- **Start Timer** - Begin 60-second countdown (after reading clue)
- **Start Judging** - Begin sequential judging process
- **Reveal Wager** - Show current player's wager on game display
- **Reveal Answer** - Show current player's answer on game display
- **Correct/Incorrect** - Judge current player, auto-advance to next

## FirestoreClient Implementation

### Key Methods

- `connect()` - Authenticate with Firebase (anonymous auth)
- `joinRoom(roomId, playerName, role)` - Join as host/player/viewer
- `selectClue(categoryId, clueId)` - Select and reveal clue
- `unlockBuzzers()` - Manually unlock buzzers for players
- `buzz()` - Player buzzes in (writes to buzzes subcollection)
- `judgeAnswer(playerId, correct)` - Judge player, move to next if incorrect
- `returnToBoard()` - Reset to clue selection
- `nextRound()` - Advance round
- `startFinalJeopardy()` - Start Final Jeopardy
- `showFinalJeopardyClue()` - Show clue (no timer)
- `startFinalJeopardyTimer()` - Start 60-second countdown
- `startFinalJeopardyJudging()` - Begin judging
- `judgeFinalJeopardyAnswer(playerId, correct)` - Judge and advance

### Real-time Subscriptions

The FirestoreClient uses `onSnapshot()` listeners for real-time updates:

- **metadata** - Host info, room creation time
- **config** - Game configuration (categories, clues)
- **state** - Current game state (status, current player, etc.)
- **players** - Player collection (scores, wagers, answers)
- **buzzes** - Buzz records for tie resolution

### Buzzer Processing (Host Client)

The host's FirestoreClient processes buzzes:

1. Listens to `buzzes` subcollection ordered by `serverTimestamp`
2. When new buzzes arrive, waits 300ms (tie window + buffer)
3. Applies tie resolution algorithm
4. Updates game state with selected player

## Key Technical Details

### Buzzer Timing

- **Server timestamp**: Firestore `serverTimestamp()` for accurate ordering
- **Tie window**: 250ms from first server timestamp
- **Selection**: Uses server timestamps for accuracy (accounts for network latency)

### Tie Fairness

The tie resolution algorithm ensures fair treatment of players who frequently tie:

1. **Track passed-over players**: `notPickedInTies` array stores player IDs who were in a tie but not selected
2. **Priority selection**: When a tie occurs, players in `notPickedInTies` get priority
3. **Update tracking**: After selection:
   - Remove selected player from `notPickedInTies`
   - Add other tied players (who weren't selected) to `notPickedInTies`

**Algorithm in `selectFromTie()`:**

```javascript
// Priority: players who haven't been picked in previous ties
const priorityPlayers = tiedPlayerIds.filter((id) =>
  notPickedInTies.includes(id),
);

// Select from priority list if available, otherwise first by timestamp
const selectedPlayerId =
  priorityPlayers.length > 0 ? priorityPlayers[0] : tiedPlayerIds[0];

// Update tracking list
notPickedInTies = notPickedInTies.filter((id) => id !== selectedPlayerId);
tiedPlayerIds.forEach((id) => {
  if (id !== selectedPlayerId && !notPickedInTies.includes(id)) {
    notPickedInTies.push(id);
  }
});
```

This ensures fair rotation among players who frequently tie, rather than always favoring the same player.

### Display Order vs Logic Order

- **`displayBuzzerOrder`**: Static, set once when tie resolved, used for UI
- **`resolvedBuzzerOrder`**: Dynamic, updated as judging progresses, used for finding next player
- UI always shows `displayBuzzerOrder` to avoid confusion from reordering

### Countdown Timer

- **Server-authoritative**: Firestore stores `finalJeopardyCountdownEnd` timestamp
- **Client calculation**: Clients calculate remaining time: `countdownEnd - Date.now()`
- **Locking**: Client rejects submissions after countdown expires
- **Display**: Updates every 100ms on client

### Final Jeopardy Judging Order

- **Fixed at start**: `finalJeopardyJudgingOrder` set when Final Jeopardy initializes
- **Based on initial scores**: Ascending order (lowest score first)
- **Never changes**: Order remains fixed even as scores change during judging
- **Sequential**: Host reveals wager → reveals answer → judges → next player

## File Structure

```
jeopairdy/
├── app/                         # Next.js pages
│   ├── api/                    # API routes
│   │   ├── games/             # Game CRUD endpoints
│   │   ├── generate/          # AI generation endpoint
│   │   └── slack/             # Slack notifications
│   ├── host/[roomId]/          # Host control page
│   ├── player/[roomId]/        # Player page
│   ├── game/[roomId]/          # Game display page
│   ├── join/                   # Join page
│   ├── create/                 # Create room page
│   ├── create-game/            # Game creation
│   └── load-game/              # Load saved game
├── components/                  # React components
│   ├── Buzzer/                 # Player buzzer component
│   ├── ClueDisplay/            # Clue/question display
│   ├── GameBoard/              # Jeopardy board
│   └── Scoreboard/             # Player scores
├── lib/                         # Client utilities
│   ├── game-client-interface.ts # IGameClient interface
│   ├── game-client-factory.ts   # Factory for creating client
│   ├── firestore-client.ts      # Firebase/Firestore client
│   ├── firebase.ts              # Firebase initialization
│   ├── host-allowlist.ts        # Host access control
│   ├── prompts.ts               # AI prompt builders
│   └── slack.ts                 # Slack notifications
├── shared/                      # Shared types
│   └── types.ts                 # TypeScript definitions
└── firestore.rules              # Firebase security rules
```

## Important Patterns

### State Updates

- All state changes happen via Firestore writes
- Firestore `onSnapshot()` broadcasts changes to all clients
- Clients update local state from snapshots
- No client-side state mutations (except UI-only state like form inputs)

### Role-Based Access

- **Host**: Can control game flow, judge answers, adjust scores (requires Google sign-in)
- **Player**: Can buzz, submit wagers/answers (anonymous auth)
- **Viewer**: Read-only, sees game display (anonymous auth)

### Security Rules

Firestore security rules enforce:

- Only authenticated users can read/write game data
- Only the host can modify game state and config
- Players can only modify their own player document
- Players can only create buzz records, not modify or delete

### Reconnection

- Players can reconnect with stored `playerId` from localStorage
- Firestore listeners automatically resume on reconnection
- Player state persists in Firestore

## Common Operations

### Adding a New Game Action

1. Add message type to interface if needed
2. Add method to `IGameClient` interface in `lib/game-client-interface.ts`
3. Implement method in `FirestoreClient` class in `lib/firestore-client.ts`
4. Update Firestore writes/reads as needed
5. Update security rules if needed
6. Update UI components to call new method via `IGameClient`

### Modifying Game Flow

- Check `lib/firestore-client.ts` for state transition logic
- Update status checks in relevant methods
- Ensure Firestore writes update state correctly
- Update client UI to handle new states

### Debugging

- Game state visible in Firebase Console
- Console logs in FirestoreClient for event tracing
- Browser console shows Firestore operations
- "Dump Game Config" button exports current config
