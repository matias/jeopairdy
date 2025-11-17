const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VALUES = [200, 400, 600, 800, 1000];
const DOUBLE_VALUES = [400, 800, 1200, 1600, 2000];

async function parseSourceMaterial(sourceMaterial) {
  if (!sourceMaterial) return null;

  // Check if it's a file path
  if (sourceMaterial.startsWith('/') || sourceMaterial.includes('.')) {
    try {
      const filePath = path.resolve(sourceMaterial);
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.txt') {
        const content = await fs.readFile(filePath, 'utf-8');
        return content;
      } else if (ext === '.pdf') {
        // For PDF, we'd need pdf-parse library
        // For now, return null and handle in prompt
        return `[PDF file: ${path.basename(filePath)}]`;
      }
    } catch (error) {
      console.error('Error reading source material:', error);
      return null;
    }
  }

  // Assume it's text content
  return sourceMaterial;
}

function extractAnswers(categories) {
  const answers = [];
  for (const category of categories) {
    for (const clue of category.clues) {
      if (clue.answer) {
        answers.push(clue.answer);
      }
    }
  }
  return answers;
}

function getSystemInstructions() {
  return `You are an expert Jeopardy! game creator and a master of thematic integration. You understand the answer/question format perfectly.

Your primary skill is creating clever, challenging, and engaging trivia. When given a list of topics, you do NOT create one category per topic. Instead, you create 6 new, creative "meta-categories" (puns, wordplay, common bonds) that uniquely connect the user's topics. Each category's clues are then drawn from that list of topics.

You must also strictly adhere to the requested difficulty level, which you understand as follows:

**Difficulty Definitions:**
* **200:** Common knowledge. A "gimme" fact.
* **400:** Accessible, but requires a specific piece of common knowledge.
* **600 (Medium):** Requires a specific fact that is *not* common knowledge. A trivia enthusiast would likely know, but a casual observer would be guessing.
* **800 (Medium-Hard):** Requires deeper knowledge of the topic or the ability to connect two facts (e.g., "This capital city is home to the museum featuring [X artwork]").
* **1000 (Hard):** A "deep cut" fact, an obscure detail, or a complex connection that only a true expert on the topic would know.`;
}

function getUserInstructions(round, values) {
  const roundName = round === 'doubleJeopardy' ? 'Double Jeopardy' : 'Jeopardy';

  return `Generate a complete ${roundName} round for a Jeopardy!-style game show.

**Core Requirements:**
* **6 categories**, each with 5 clues.
* **Clue values:** ${values.join(', ')} (in order of increasing difficulty).
* **JSON Format:** Use the exact JSON structure provided below.
* **Clue/Answer Format:**
    * The "clue" field is the *answer* (what contestants see). Make sure that a clue is NOT part of a category name.
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

function buildPrompt(
  topics,
  difficulty,
  sourceMaterial,
  round,
  excludedAnswers = [],
) {
  const isDouble = round === 'doubleJeopardy';
  const values = isDouble ? DOUBLE_VALUES : VALUES;

  // Get base user instructions
  let prompt = getUserInstructions(round, values);

  // Add excluded answers section if this is a subsequent round
  if (excludedAnswers.length > 0) {
    prompt += `\n\n**CRITICAL - EXCLUDE PREVIOUS ANSWERS:**
Do NOT use any of these answers that have already been used in previous rounds:
${excludedAnswers.map((a) => `* ${a}`).join('\n')}

Make sure all your answers are completely different from the ones listed above.`;
  }

  // Add source material if provided
  if (sourceMaterial) {
    prompt += `\n\n**Source Material Context:**\n${sourceMaterial.substring(0, 1000)}${sourceMaterial.length > 1000 ? '...' : ''}`;
  }

  return prompt;
}

async function generateRound(
  topics,
  difficulty,
  sourceMaterial,
  round = 'jeopardy',
  excludedAnswers = [],
) {
  const roundName = round === 'doubleJeopardy' ? 'Double Jeopardy' : 'Jeopardy';
  console.log(`[Generator] Starting ${roundName} round generation...`);
  console.log(
    `[Generator] Topics: ${topics || 'General knowledge'}, Difficulty: ${difficulty || 'medium'}`,
  );
  if (excludedAnswers.length > 0) {
    console.log(
      `[Generator] Excluding ${excludedAnswers.length} previous answers`,
    );
  }

  const prompt = buildPrompt(
    topics,
    difficulty,
    sourceMaterial,
    round,
    excludedAnswers,
  );
  const systemInstructions = getSystemInstructions();

  // Build the request message with topics and difficulty first
  const difficultyText = difficulty || 'medium';
  const topicsText = topics || 'General knowledge';
  const requestMessage = `Generate a complete ${roundName} round with ${difficultyText} difficulty for the topics: ${topicsText}`;

  try {
    console.log(`[Generator] Making OpenAI API call for ${roundName} round...`);
    console.log(
      `[Generator] Model: gpt-5, Topics: ${topicsText}, Difficulty: ${difficultyText}`,
    );
    const response = await openai.responses.create({
      model: 'gpt-5.1',
      instructions: systemInstructions,
      input: [
        { type: 'message', role: 'user', content: prompt },
        { type: 'message', role: 'user', content: requestMessage },
      ],
      text: {
        format: { type: 'json_object' },
      },
    });
    console.log(`[Generator] OpenAI API call completed for ${roundName} round`);

    const content = response.output_text;
    const parsed = JSON.parse(content);

    // Transform to our format
    const categories = parsed.categories.map((cat, catIndex) => ({
      id: `cat-${round}-${catIndex}`,
      name: cat.name,
      clues: cat.clues.map((clue, clueIndex) => ({
        id: `clue-${round}-${catIndex}-${clueIndex}`,
        category: cat.name,
        value: clue.value,
        clue: clue.clue,
        answer: clue.answer,
        revealed: false,
        answered: false,
      })),
    }));

    console.log(
      `[Generator] ${roundName} round generation completed successfully (${categories.length} categories, ${categories.reduce((sum, cat) => sum + cat.clues.length, 0)} clues)`,
    );
    return categories;
  } catch (error) {
    console.error(`[Generator] Error generating ${roundName} round:`, error);
    throw error;
  }
}

async function generateFinalJeopardy(
  topics,
  difficulty,
  sourceMaterial,
  excludedAnswers = [],
) {
  console.log('[Generator] Starting Final Jeopardy generation...');
  console.log(
    `[Generator] Topics: ${topics || 'General knowledge'}, Difficulty: ${difficulty || 'medium'}`,
  );
  if (excludedAnswers.length > 0) {
    console.log(
      `[Generator] Excluding ${excludedAnswers.length} previous answers from rounds`,
    );
  }

  const systemInstructions = getSystemInstructions();

  let prompt = `Generate a Final Jeopardy clue for a Jeopardy!-style game show.

**Requirements:**
* One category
* One clue (the answer in Jeopardy format)
* One answer (in question format)

**Difficulty level:** ${difficulty || 'medium'}

${topics ? `**Topics/themes to focus on:** ${topics}\n` : ''}
${sourceMaterial ? `**Source material context:** ${sourceMaterial.substring(0, 1000)}${sourceMaterial.length > 1000 ? '...' : ''}\n` : ''}
${excludedAnswers.length > 0 ? `\n**CRITICAL - EXCLUDE PREVIOUS ANSWERS:**\nDo NOT use any of these answers that have already been used in previous rounds:\n${excludedAnswers.map((a) => `* ${a}`).join('\n')}\n\nMake sure your answer is completely different from the ones listed above.\n` : ''}

**Format your response as a JSON object:**
\`\`\`json
{
  "category": "Category Name",
  "clue": "This is the answer that appears on screen",
  "answer": "What is the question format response?"
}
\`\`\`

**Important:**
* The "clue" field is what contestants see (the answer in Jeopardy format)
* The "answer" field is what contestants must respond with (in question format)
* Make it appropriately challenging for Final Jeopardy
* Ensure it's interesting and engaging

Generate the Final Jeopardy clue now:`;

  // Build the request message with topics and difficulty first
  const difficultyText = difficulty || 'medium';
  const topicsText = topics || 'General knowledge';
  const requestMessage = `Generate a Final Jeopardy clue with ${difficultyText} difficulty for the topics: ${topicsText}`;

  try {
    console.log('[Generator] Making OpenAI API call for Final Jeopardy...');
    console.log(
      `[Generator] Model: gpt-5, Topics: ${topicsText}, Difficulty: ${difficultyText}`,
    );
    const response = await openai.responses.create({
      model: 'gpt-5.1',
      instructions: systemInstructions,
      input: [
        { type: 'message', role: 'user', content: prompt },
        { type: 'message', role: 'user', content: requestMessage },
      ],
      text: {
        format: { type: 'json_object' },
      },
    });
    console.log('[Generator] OpenAI API call completed for Final Jeopardy');

    const content = response.output_text;
    const parsed = JSON.parse(content);

    console.log(
      `[Generator] Final Jeopardy generation completed successfully (Category: "${parsed.category}")`,
    );
    return {
      category: parsed.category,
      clue: parsed.clue,
      answer: parsed.answer,
    };
  } catch (error) {
    console.error('[Generator] Error generating Final Jeopardy:', error);
    throw error;
  }
}

async function generateGame(prompt, difficulty, sourceMaterial) {
  console.log('[Generator] ========================================');
  console.log('[Generator] Starting game generation...');
  console.log('[Generator] ========================================');

  const sourceText = await parseSourceMaterial(sourceMaterial);

  // Extract topics from prompt if not explicitly provided
  const topics = prompt || 'General knowledge';

  try {
    // Generate rounds sequentially to avoid duplicate answers
    // First, generate the Jeopardy round
    const jeopardyCategories = await generateRound(
      topics,
      difficulty,
      sourceText,
      'jeopardy',
    );

    // Extract all answers from the first round
    console.log('[Generator] Extracting answers from Jeopardy round...');
    const jeopardyAnswers = extractAnswers(jeopardyCategories);
    console.log(
      `[Generator] Extracted ${jeopardyAnswers.length} answers from Jeopardy round`,
    );

    // Generate Double Jeopardy with excluded answers from first round
    const doubleJeopardyCategories = await generateRound(
      topics,
      difficulty,
      sourceText,
      'doubleJeopardy',
      jeopardyAnswers,
    );

    // Extract all answers from both rounds
    console.log('[Generator] Extracting answers from Double Jeopardy round...');
    const doubleJeopardyAnswers = extractAnswers(doubleJeopardyCategories);
    console.log(
      `[Generator] Extracted ${doubleJeopardyAnswers.length} answers from Double Jeopardy round`,
    );
    const allRoundAnswers = [...jeopardyAnswers, ...doubleJeopardyAnswers];
    console.log(
      `[Generator] Total answers to exclude for Final Jeopardy: ${allRoundAnswers.length}`,
    );

    // Generate Final Jeopardy with excluded answers from both rounds
    const finalJeopardy = await generateFinalJeopardy(
      topics,
      difficulty,
      sourceText,
      allRoundAnswers,
    );

    const gameConfig = {
      id: `game-${Date.now()}`,
      jeopardy: {
        round: 'jeopardy',
        categories: jeopardyCategories,
      },
      doubleJeopardy: {
        round: 'doubleJeopardy',
        categories: doubleJeopardyCategories,
      },
      finalJeopardy,
      createdAt: new Date().toISOString(),
    };

    console.log('[Generator] ========================================');
    console.log(
      `[Generator] Game generation completed successfully! Game ID: ${gameConfig.id}`,
    );
    console.log('[Generator] ========================================');
    return gameConfig;
  } catch (error) {
    console.error('[Generator] Error generating game:', error);
    throw error;
  }
}

module.exports = {
  generateGame,
  generateRound,
  generateFinalJeopardy,
  buildPrompt,
};
