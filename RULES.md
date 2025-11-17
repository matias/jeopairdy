# Jeopairdy Game Rules

## Overview

Jeopairdy is a live, web-based Jeopardy!-style trivia game designed to be played in a room with a host and multiple players. The game consists of three rounds: Jeopardy, Double Jeopardy, and Final Jeopardy.

## Game Structure

### Jeopardy Round

- 6 categories, each with 5 clues
- Clue values: $200, $400, $600, $800, $1000
- Players select clues by category and value
- Once a clue is selected, it cannot be selected again

### Double Jeopardy Round

- 6 categories, each with 5 clues
- Clue values: $400, $800, $1200, $1600, $2000 (double the Jeopardy round)
- Same gameplay as Jeopardy round

### Final Jeopardy

- One category with one clue
- Players wager any amount up to their current score
- Players write their answer (in question format)
- Correct answers add the wager; incorrect answers subtract the wager

## Gameplay Flow

### Selecting Clues

1. Host selects a clue from the board
2. Clue is revealed to all players
3. After a brief reading period (3 seconds), buzzers are unlocked
4. Players can buzz in to answer

### Buzzing In

1. When buzzers are unlocked, players can press their buzzer
2. The first player to buzz in (based on client-side timestamp) gets to answer
3. If a player buzzes in incorrectly, the next player in buzzer order gets a chance
4. If all players who buzzed in answer incorrectly, the clue goes unanswered

### Answering

1. The player who buzzed in first must provide an answer
2. Answers must be in question format (e.g., "What is Paris?", "Who is Shakespeare?")
3. Host judges the answer as correct or incorrect
4. Correct answers: player gains the clue value
5. Incorrect answers: player loses the clue value

### Scoring

- Correct answers: +clue value
- Incorrect answers: -clue value
- Host can manually adjust scores if needed
- Scores can go negative

### Round Transitions

- Host can manually advance to the next round
- Double Jeopardy begins after Jeopardy round is complete
- Final Jeopardy begins after Double Jeopardy round is complete (or when host starts it)

### Final Jeopardy

1. All players see the Final Jeopardy category
2. Players place their wagers (0 to their current score)
3. Once all wagers are placed, the clue is revealed
4. Players write their answers
5. Once all answers are submitted, the correct answer is revealed
6. Scores are updated based on wagers and correctness

## Roles

### Host

- Creates the game room
- Generates or loads game questions
- Controls game flow (selects clues, reveals answers, judges responses)
- Manages scores
- Advances rounds
- Can manually adjust scores

### Players

- Join game room with 4-character code or QR code
- Use device as buzzer
- View their score
- Answer clues when they buzz in first
- Place wagers and submit answers for Final Jeopardy

## Technical Details

### Buzzer System

- Uses client-side timestamps to determine who buzzed first
- Buzzer is locked for 3 seconds after clue is revealed (reading time)
- Only the first player to buzz can answer
- If they answer incorrectly, the next player in buzzer order can answer

### Game State

- Game state is synchronized in real-time via WebSocket
- All players see updates immediately
- Game persists in memory (can be extended to use Redis for persistence)

## Winning

The player with the highest score after Final Jeopardy wins. In case of a tie, the game can end in a tie, or the host can decide on a tiebreaker.

## Notes

- This is a simplified version of Jeopardy! - some rules may differ from the TV show
- Daily Doubles are not currently implemented
- Audio/visual clues are not currently supported
- The game is designed for live, in-person play with all participants in the same room
