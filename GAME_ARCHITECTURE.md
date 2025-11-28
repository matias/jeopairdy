# Jeopairdy Game Architecture

## Overview

Jeopairdy is a Jeopardy!-style trivia game built with Next.js (React) frontend. The game supports multiple players competing in real-time with a host controlling the game flow.

**The game supports two modes:**

- **Local Mode (WebSocket)**: Uses a local Node.js WebSocket server for real-time communication. Best for local network play where the host runs the server.
- **Online Mode (Firebase)**: Uses Firebase Firestore for real-time synchronization. Best for online play without running a server.

## Dual-Mode Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Page Components                          │
│  (host/player/game pages - use IGameClient interface)       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              createGameClient() Factory                     │
│  (lib/game-client-factory.ts - auto-detects mode)           │
└─────────────────────────────────────────────────────────────┘
                    │                     │
          ┌─────────┴─────────┐   ┌───────┴────────┐
          ▼                   ▼   ▼                ▼
┌──────────────────┐  ┌──────────────────────────────┐
│  WebSocketClient │  │     FirestoreClient          │
│  (lib/websocket) │  │  (lib/firestore-client.ts)   │
└──────────────────┘  └──────────────────────────────┘
          │                         │
          ▼                         ▼
┌──────────────────┐  ┌──────────────────────────────┐
│  Local WS Server │  │       Firebase Firestore     │
│  (server/)       │  │  (Cloud-hosted database)     │
└──────────────────┘  └──────────────────────────────┘
```

### Mode Auto-Detection

The `createGameClient()` factory automatically detects which mode to use:

1. **Explicit override**: Set `NEXT_PUBLIC_FIREBASE_MODE=true` or `false` in environment
2. **Firebase Hosting**: If running on `*.firebaseapp.com` or `*.web.app` domains
3. **Cloud deployment**: If running on non-local hostname with Firebase configured
4. **Default**: Uses WebSocket mode for localhost and local network IPs

### Key Files

- **`lib/game-client-interface.ts`** - Common interface (`IGameClient`) for both clients
- **`lib/game-client-factory.ts`** - Factory that creates the appropriate client
- **`lib/websocket.ts`** - WebSocket client implementation
- **`lib/firestore-client.ts`** - Firestore client implementation
- **`lib/firebase.ts`** - Firebase initialization and authentication
- **`firestore.rules`** - Security rules for Firestore

### Environment Variables

Add these to your `.env.local` file:

```env
# Mode selection (optional - auto-detects if not set)
NEXT_PUBLIC_FIREBASE_MODE=false

# WebSocket mode
NEXT_PUBLIC_WS_PORT=3001
NEXT_PUBLIC_API_URL=http://localhost:3001

# Firebase mode (get from Firebase Console)
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Firestore Database** in production mode
3. Enable **Anonymous Authentication** under Authentication > Sign-in method
4. Add a Web App and copy the config values to `.env.local`
5. Deploy security rules: `firebase deploy --only firestore:rules`

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

The create-game page now orchestrates an iterative chat-driven workflow with GPT-5.1:

1. **Parameter entry:** Host supplies topics, difficulty, and optional source text.
2. **Sample iteration:** Client-side calls to `/api/generate` (which proxies to OpenAI) request sparse sample categories using prompt builders in `lib/prompts.ts`. The host can review rendered categories/clues plus the model's commentary, then submit feedback for additional iterations.
3. **Finalization:** When satisfied, the host requests full rounds. The client sequentially generates Jeopardy, Double Jeopardy (excluding prior answers), and Final Jeopardy JSON payloads, then converts them into a `GameConfig`.
4. **Deployment:** The completed config is sent to the game server via `WebSocketClient.loadGame()`, after which the host UI redirects to `/host/[roomId]`.

Only the final `GameConfig` touches the server; iterative samples remain client-side for rapid experimentation.

##### Conversation state

- `/api/generate` now creates and manages an OpenAI **Conversation** (via the Responses + Conversations APIs). The first sample request spins up a conversation with the system instructions from `lib/prompts.ts`; every subsequent regeneration, round build, or Final Jeopardy request sends only the incremental user message while reusing that conversation ID.
- Because the model retains state, feedback supplied during the sample loop directly influences the final Jeopardy rounds without manually restating previous prompts. Developers can reset the flow by issuing a new "Generate Samples" request, which starts a fresh conversation ID in the client state.

### Server Components

- **`server/src/game/state.js`** - Game state management (GameManager class)
- **`server/src/websocket/server.js`** - WebSocket message handling

### Shared Types

- **`shared/types.ts`** - TypeScript types for game state and messages

## Game State Structure

### GameStatus Enum

The game progresses through these states:

1. **`waiting`** - Room created, no game loaded
2. **`ready`** - Game loaded, waiting to start
3. **`selecting`** - Host selecting clues from board
4. **`clueRevealed`** - Clue displayed, buzzer locked (3 second delay)
5. **`buzzing`** - Buzzer unlocked, players can buzz
6. **`answering`** - Player selected (after tie resolution), waiting for answer
7. **`judging`** - Host can judge answer (after revealing answer to players)
8. **`finalJeopardyWagering`** - Final Jeopardy: players placing wagers
9. **`finalJeopardyAnswering`** - Final Jeopardy: players writing answers (30s countdown)
10. **`finalJeopardyJudging`** - Final Jeopardy: host judging players sequentially
11. **`finished`** - Game complete

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

  // Final Jeopardy state
  finalJeopardyInitialScores?: Map<string, number> | Record<string, number>;
  finalJeopardyJudgingOrder?: string[]; // Player IDs sorted by initial score (ascending)
  finalJeopardyClueShown?: boolean;
  finalJeopardyCountdownStart?: number;
  finalJeopardyCountdownEnd?: number; // Server timestamp when countdown expires
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
   - Buzzer locked for 3 seconds
   - Clue displayed on all screens

2. **Buzzer unlocks** → Status: `buzzing`
   - Players can buzz in
   - Server tracks all buzzes with timestamps

3. **Tie resolution** (250ms window)
   - All buzzes within 250ms are considered "tied"
   - Server selects one player using fairness algorithm
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
- Not eligible to answer (only tied players can answer)

**Judging Multiple Players:**

- When first player judged incorrect, server finds next unjudged player in `displayBuzzerOrder`
- Sets that player as `currentPlayer`
- Host can judge them, repeat until all judged or someone correct

### Final Jeopardy Flow

1. **Initialize Final Jeopardy** → `initializeFinalJeopardy(roomId)`
   - Captures snapshot of player scores → `finalJeopardyInitialScores`
   - Creates judging order (ascending by score) → `finalJeopardyJudgingOrder`
   - Status: `finalJeopardyWagering`
   - Only players with score > 0 can participate

2. **Players wager** → `submitWager(wager)`
   - Client validates: 0 ≤ wager ≤ player.score
   - Server validates: player.score > 0 required
   - No auto-advance (host manually shows clue)

3. **Host shows clue** → `showFinalJeopardyClue()`
   - Requires all eligible players to have wagered
   - Status: `finalJeopardyAnswering`
   - Starts 30-second countdown (server-authoritative)
   - Sets `finalJeopardyCountdownEnd` timestamp

4. **Players answer** → `submitFinalAnswer(answer)`
   - Server checks if countdown expired
   - Rejects submissions after `finalJeopardyCountdownEnd`
   - No auto-advance (host manually starts judging)

5. **Host starts judging** → `startFinalJeopardyJudging()`
   - Status: `finalJeopardyJudging`
   - Sets `finalJeopardyJudgingPlayerIndex = 0` (lowest score first)

6. **Sequential judging** (for each player in order):
   - `revealFinalJeopardyWager()` - Shows player's wager on game display
   - `revealFinalJeopardyAnswer()` - Shows player's answer on game display
   - `judgeFinalJeopardyAnswer(playerId, correct)` - Applies wager, moves to next player
   - When last player judged, status: `finished`

## Host Controls

### Main Game Controls

- **Select Clue** - Click on game board clue
- **Reveal Answer** - Show answer to players (optional, doesn't block judging)
- **Judge Answer** - Mark current player Correct/Incorrect
- **Back to Board** - Return to clue selection
- **Next Round** - Advance from Jeopardy → Double Jeopardy
- **Start Final Jeopardy** - Advance from Double Jeopardy → Final Jeopardy
- **Manual Score Adjustment** - Adjust any player's score manually

### Final Jeopardy Controls

- **Show Clue** - Reveal clue and start 30s countdown (requires all eligible players wagered)
- **Start Judging** - Begin sequential judging process
- **Reveal Wager** - Show current player's wager on game display
- **Reveal Answer** - Show current player's answer on game display
- **Correct/Incorrect** - Judge current player, auto-advance to next

## Server-Side Game State Management

### GameManager Class (`server/src/game/state.js`)

**Key Methods:**

- `createRoom(roomId, hostId)` - Initialize new game room
- `selectClue(roomId, categoryId, clueId)` - Select and reveal clue
- `handleBuzz(roomId, playerId, clientTimestamp, serverTimestamp)` - Process player buzz
- `processBuzzerOrder(roomId)` - Resolve ties, set current player
- `judgeAnswer(roomId, playerId, correct)` - Judge player, move to next if incorrect
- `returnToBoard(roomId)` - Reset to clue selection
- `nextRound(roomId)` - Advance round
- `initializeFinalJeopardy(roomId)` - Start Final Jeopardy
- `showFinalJeopardyClue(roomId)` - Show clue, start countdown
- `startFinalJeopardyJudging(roomId)` - Begin judging
- `judgeFinalJeopardyAnswer(roomId, playerId, correct)` - Judge and advance

**State Persistence:**

- Game state stored in memory (`games` Map)
- No database (ephemeral)
- Game config can be saved/loaded as JSON files

## WebSocket Communication

### Message Types

**Client → Server:**

- `joinRoom` - Join as host/player/viewer
- `selectClue` - Host selects clue
- `buzz` - Player buzzes in
- `revealAnswer` - Host reveals answer to players
- `judgeAnswer` - Host judges player
- `showFinalJeopardyClue` - Host shows Final Jeopardy clue
- `startFinalJeopardyJudging` - Host starts judging
- `revealFinalJeopardyWager` - Host reveals wager
- `revealFinalJeopardyAnswer` - Host reveals answer
- `judgeFinalJeopardyAnswer` - Host judges Final Jeopardy answer
- `submitWager` - Player submits Final Jeopardy wager
- `submitFinalAnswer` - Player submits Final Jeopardy answer
- `returnToBoard` - Host returns to board
- `updateScore` - Host manually adjusts score

**Server → Client:**

- `roomJoined` - Confirmation of room join
- `gameStateUpdate` - Broadcast of game state changes
- `buzzerLocked` - Buzzer lock/unlock status
- `buzzReceived` - Notification of buzz (for UI feedback)
- `error` - Error messages

### State Serialization

`serializeGameState()` in `server.js` converts server game state to JSON:

- Maps converted to arrays
- Internal server-only fields excluded (timeouts, callbacks)
- `finalJeopardyInitialScores` Map → plain object

## Key Technical Details

### Buzzer Timing

- **Client timestamp**: When player's browser detected buzz
- **Server timestamp**: When server received buzz
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

- **Server-authoritative**: Server sets `finalJeopardyCountdownEnd` timestamp
- **Client calculation**: Clients calculate remaining time: `countdownEnd - Date.now()`
- **Locking**: Server rejects submissions after countdown expires
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
│   ├── host/[roomId]/          # Host control page
│   ├── player/[roomId]/        # Player page
│   ├── game/[roomId]/          # Game display page
│   ├── join/                   # Join page
│   ├── create-game/            # Game creation
│   └── load-game/              # Load saved game
├── components/                  # React components
│   ├── Buzzer/                 # Player buzzer component
│   ├── ClueDisplay/            # Clue/question display
│   ├── GameBoard/              # Jeopardy board
│   └── Scoreboard/             # Player scores
├── server/                      # Node.js backend (WebSocket mode)
│   ├── src/
│   │   ├── game/               # Game state management
│   │   └── websocket/          # WebSocket server
│   └── test-data/              # Saved game configs
├── lib/                         # Client utilities
│   ├── game-client-interface.ts # IGameClient interface
│   ├── game-client-factory.ts   # Factory for creating clients
│   ├── websocket.ts             # WebSocket client implementation
│   ├── firestore-client.ts      # Firebase/Firestore client implementation
│   ├── firebase.ts              # Firebase initialization
│   └── websocket-url.ts         # WebSocket URL config
├── shared/                      # Shared types
│   └── types.ts                 # TypeScript definitions
└── firestore.rules              # Firebase security rules
```

## Important Patterns

### State Updates

- All state changes happen server-side
- Server broadcasts `gameStateUpdate` to all clients
- Clients update local state from broadcasts
- No client-side state mutations (except UI-only state like form inputs)

### Role-Based Access

- **Host**: Can control game flow, judge answers, adjust scores
- **Player**: Can buzz, submit wagers/answers
- **Viewer**: Read-only, sees game display

### Error Handling

- Server validates all actions (role, game state, permissions)
- Returns `error` messages via WebSocket
- Client shows errors to user

### Reconnection

- Players can reconnect with stored `playerId`
- Server recognizes reconnection and restores player state
- WebSocket client has auto-reconnect logic

## Common Operations

### Adding a New Game Action

1. Add message type to `ClientMessage` in `shared/types.ts`
2. Add method to `IGameClient` interface in `lib/game-client-interface.ts`
3. **WebSocket mode:**
   - Add handler in `server/src/websocket/server.js` `handleMessage()`
   - Implement handler function (e.g., `handleNewAction()`)
   - Add method to `GameManager` class if state change needed
   - Add client method to `lib/websocket.ts`
4. **Firebase mode:**
   - Add method to `FirestoreClient` class in `lib/firestore-client.ts`
   - Update Firestore writes/reads as needed
5. Update UI components to call new method via `IGameClient`

### Modifying Game Flow

- Check `server/src/game/state.js` for state transition logic
- Update status checks in relevant methods
- Ensure WebSocket broadcasts state updates
- Update client UI to handle new states

### Debugging

- Server logs buzzer debug info (tie resolution, timestamps)
- Game state can be dumped to console via "Dump Game Config" button
- Check browser console for WebSocket messages
- Server console shows all game state changes
