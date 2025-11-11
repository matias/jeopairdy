# Jeopardy Live Game Platform

## Architecture Overview

**Frontend**: Next.js (React + TypeScript) deployed on Render as web service

**Backend**: Node.js/Express server with WebSocket support, same Render service

**Real-time**: Native WebSockets with client-side timestamping for buzzer accuracy

**AI**: OpenAI GPT-5 API for question generation

**Storage**: JSON files for test game configs, in-memory for active games

## Project Structure

```
jeopairdy/
├── frontend/                 # Next.js app (Render)
│   ├── app/
│   │   ├── host/            # Host control view
│   │   ├── game/            # Game display view (TV/screen)
│   │   └── player/          # Player buzzer view
│   ├── components/
│   │   ├── GameBoard/       # Jeopardy board component
│   │   ├── ClueDisplay/     # Question/answer display
│   │   ├── Buzzer/          # Player buzzer interface
│   │   └── Scoreboard/      # Score display
│   └── lib/
│       └── websocket.ts     # WebSocket client with timestamping
├── server/                   # Node.js backend
│   ├── src/
│   │   ├── game/            # Game state management
│   │   ├── websocket/       # WebSocket server handlers
│   │   ├── ai/              # OpenAI question generation
│   │   └── routes/          # REST API routes
│   └── test-data/           # JSON game configs for testing
├── public/
│   └── jeopardy/            # Sound files (from reference repo)
└── shared/                  # Shared types between frontend/backend
    └── types.ts
```

## Key Features

### 1. Game Generation (AI)

- Host provides prompt: topics, difficulty, source material (text/PDF)
- Generate 2 rounds (Jeopardy + Double Jeopardy) + Final Jeopardy
- Each round: 6 categories × 5 questions ($200-$1000, double for Double)
- Store generated games as JSON for replay/testing

### 2. Host Views

- **Host Control View** (`/host/[roomId]`):
  - Game board with controls
  - Reveal answers, manage scores
  - See who buzzed (with timestamps)
  - Control game flow (round transitions, Final Jeopardy)
- **Game Display View** (`/game/[roomId]`):
  - Public-facing board display
  - Shows selected clues/questions
  - Optional score display during selection phase

### 3. Player Views

- **Player Buzzer** (`/player/[roomId]`):
  - Connect via 4-char code or QR code
  - Buzzer button (locked/unlocked states)
  - Score display
  - Final Jeopardy: wager + answer input

### 4. Real-time Communication

- WebSocket server for all connections
- Buzzer events include client-side timestamp
- Server determines order by timestamp, not arrival time
- Room-based message routing

### 5. Styling & Assets

- Jeopardy!-style design (fonts, colors, layout)
- Reuse sounds from reference repo
- Use Gipaody font from reference repo

## Implementation Steps

### Phase 1: Core Infrastructure

1. Set up Next.js project structure with app router
2. Set up Node.js/Express backend with WebSocket support
3. Create shared TypeScript types for game state
4. Implement basic room creation/joining (4-char codes, QR codes)

### Phase 2: Game State & Logic

5. Implement game state machine (Jeopardy → Double Jeopardy → Final)
6. Create game board component with 6×5 grid
7. Implement clue selection and reveal logic
8. Add scoring system (points add/subtract)

### Phase 3: Real-time Buzzer System

9. Implement WebSocket server with room support
10. Add client-side timestamping to buzzer events
11. Implement buzzer lockout logic (based on clue reveal timing)
12. Create player buzzer UI with lockout states

### Phase 4: Host Controls

13. Build host control view with game board
14. Add answer reveal controls
15. Implement score management UI
16. Add buzzer order display (who buzzed when)

### Phase 5: Game Display View

17. Create public game display view
18. Implement clue/question display
19. Add optional scoreboard during selection phase

### Phase 6: AI Question Generation

20. Integrate OpenAI GPT-5 API
21. Create prompt builder for game generation
22. Implement PDF/text file parsing for source material
23. Generate full game structure (2 rounds + Final)
24. Save generated games as JSON configs

### Phase 7: Final Jeopardy

25. Implement Final Jeopardy round
26. Add wager input for players
27. Add answer submission for players
28. Implement Final Jeopardy reveal flow

### Phase 8: Testing & Polish

29. Create test game JSON generator
30. Add game replay from JSON configs
31. Style components to match Jeopardy! aesthetic
32. Add sound effects integration
33. Test buzzer latency and accuracy

## Technical Decisions

- **WebSocket Library**: Native `ws` library for server, native WebSocket API for client
- **Timestamp Strategy**: `Date.now()` on client when button pressed, sent with buzz event
- **Room Management**: In-memory Map for active games (can add Redis later)
- **Game Config Format**: JSON matching structure from reference repo where possible
- **Deployment**: Everything on Render (Next.js frontend + Node.js WebSocket server as single web service)

## Files to Create/Modify

Key files:

- `frontend/app/host/[roomId]/page.tsx` - Host control view
- `frontend/app/game/[roomId]/page.tsx` - Game display view  
- `frontend/app/player/[roomId]/page.tsx` - Player buzzer view
- `server/src/websocket/server.ts` - WebSocket server
- `server/src/ai/generator.ts` - OpenAI question generation
- `server/src/game/state.ts` - Game state management
- `shared/types.ts` - Shared TypeScript types