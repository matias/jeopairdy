#!/usr/bin/env node

// Standalone prompt builder (no OpenAI dependency)
const VALUES = [200, 400, 600, 800, 1000];
const DOUBLE_VALUES = [400, 800, 1200, 1600, 2000];

function getUserInstructions(round, values) {
  const roundName = round === 'doubleJeopardy' ? 'Double Jeopardy' : 'Jeopardy';
  
  return `Generate a complete ${roundName} round for a Jeopardy!-style game show.

**Core Requirements:**
* **6 categories**, each with 5 clues.
* **Clue values:** ${values.join(', ')} (in order of increasing difficulty).
* **JSON Format:** Use the exact JSON structure provided below.
* **Clue/Answer Format:**
    * The "clue" field is the *answer* (what contestants see).
    * The "answer" field is the *question* (what contestants must respond with, e.g., "What is...", "Who is...").

---

**CRITICAL INSTRUCTIONS ON THEMES & DIFFICULTY:**

**1. THEMATIC INTEGRATION (THIS IS THE MOST IMPORTANT RULE):**
* You will be given a list of topics.
* **DO NOT** create a category for each topic.
    * **BAD:** If the topic is "Lord of the Rings", DO NOT make a category named "MIDDLE-EARTH MATTERS".
    * **BAD:** If the topic is "Whitney Houston", DO NOT make a category named "WHITNEY'S WORLD".
* **INSTEAD:** You must create 6 **new, creative categories** that are puns, portmanteaus, or common-bond themes. These new categories must be designed to pull clues from **at least two** of the provided topics.
    * **GOOD:** For topics 'Whitney Houston' and 'Lord of the Rings', a good creative category might be **"I WILL ALWAYS LOVE... RINGS"**. A 400 clue could be about Whitney's song, and an 800 clue could be about the One Ring.
    * **GOOD:** For '90s Pop' and 'World Capitals', a good category might be **"POP-ULATED PLACES"**. A 400 clue could be about the capital of Sweden (a '90s pop hotspot), and an 800 clue could be about the city where the Spice Girls formed.
* All 30 clues (6 categories x 5 clues) MUST be *about* one of the topics provided by the user.

**2. DIFFICULTY CALIBRATION:**
* You must follow the difficulty definitions in the system prompt.
* When I request **"medium" difficulty**, this is a specific instruction. It means the 200/400 clues can be straightforward, but the **600, 800, and 1000-point clues must be genuinely challenging** for a general audience. They must require specific, non-surface-level knowledge. The previous output's "medium" clues were far too easy.

---

**Required JSON Structure:**
\`\`\`json
{
"categories": [
{
"name": "Category Name",
"clues": [
{
"value": 200,
"clue": "This is the answer that appears on screen",
"answer": "What is the question format response?"
},
... (4 more clues with values 400, 600, 800, 1000)
]
},
... (5 more categories)
]
}
\`\`\``;
}

function buildPrompt(topics, difficulty, sourceMaterial, round, excludedAnswers = []) {
  const isDouble = round === 'doubleJeopardy';
  const values = isDouble ? DOUBLE_VALUES : VALUES;
  
  // Get base user instructions
  let prompt = getUserInstructions(round, values);
  
  // Add excluded answers section if this is a subsequent round
  if (excludedAnswers.length > 0) {
    prompt += `\n\n**CRITICAL - EXCLUDE PREVIOUS ANSWERS:**
Do NOT use any of these answers that have already been used in previous rounds:
${excludedAnswers.map(a => `* ${a}`).join('\n')}

Make sure all your answers are completely different from the ones listed above.`;
  }
  
  // Add source material if provided
  if (sourceMaterial) {
    prompt += `\n\n**Source Material Context:**\n${sourceMaterial.substring(0, 1000)}${sourceMaterial.length > 1000 ? '...' : ''}`;
  }
  
  // Add the specific user prompt with topics and difficulty
  const difficultyText = difficulty || 'medium';
  const topicsText = topics || 'General knowledge';
  prompt += `\n\nGenerate a complete round with ${difficultyText} difficulty for the topics: ${topicsText}`;

  return prompt;
}

// Parse command line arguments
const args = process.argv.slice(2);

// Default values
let topics = 'General knowledge';
let difficulty = 'medium';
let round = 'jeopardy';

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--topics' || arg === '-t') {
    topics = args[++i] || topics;
  } else if (arg === '--difficulty' || arg === '-d') {
    difficulty = args[++i] || difficulty;
  } else if (arg === '--round' || arg === '-r') {
    round = args[++i] || round;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: node test-prompt.js [options]

Options:
  -t, --topics <text>      Topics/themes for the game (default: "General knowledge")
  -d, --difficulty <level> Difficulty level: easy, medium, or hard (default: "medium")
  -r, --round <round>      Round type: "jeopardy" or "doubleJeopardy" (default: "jeopardy")
  -h, --help               Show this help message

Examples:
  node test-prompt.js --topics "World History" --difficulty medium
  node test-prompt.js -t "Science Fiction" -d hard -r jeopardy
  node test-prompt.js --topics "Movies" --difficulty easy
`);
    process.exit(0);
  }
}

// Generate and output the prompt
const prompt = buildPrompt(topics, difficulty, null, round);

console.log('='.repeat(80));
console.log('JEOPARDY ROUND PROMPT');
console.log('='.repeat(80));
console.log(`Topics: ${topics}`);
console.log(`Difficulty: ${difficulty}`);
console.log(`Round: ${round}`);
console.log('='.repeat(80));
console.log('\n');
console.log(prompt);
console.log('\n');
console.log('='.repeat(80));

