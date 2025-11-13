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

function buildPrompt(topics, difficulty, sourceMaterial, round) {
  const isDouble = round === 'doubleJeopardy';
  const roundName = isDouble ? 'Double Jeopardy' : 'Jeopardy';
  const values = isDouble ? DOUBLE_VALUES : VALUES;

  let prompt = `Generate a complete ${roundName} round for a Jeopardy!-style game show.

Requirements:
- 6 categories, each with 5 clues
- Clue values: ${values.join(', ')} (in order of difficulty, easiest to hardest)
- Each clue should have a question (the "answer" in Jeopardy format) and the correct response (the "question" format)
- Categories should be diverse and interesting
- Clues should increase in difficulty within each category
- Difficulty level: ${difficulty || 'moderate'}

${topics ? `Topics/themes to focus on: ${topics}\n` : ''}
${sourceMaterial ? `Source material context: ${sourceMaterial.substring(0, 1000)}...\n` : ''}

Format your response as a JSON object with this exact structure:
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

Important:
- The "clue" field is what contestants see (the answer in Jeopardy format)
- The "answer" field is what contestants must respond with (in question format, like "What is...")
- Make sure answers are in question format (e.g., "What is Paris?", "Who is Shakespeare?")
- Ensure clues are interesting, accurate, and appropriate for the difficulty level
- Categories should be creative and engaging

Generate the complete round now:`;

  return prompt;
}

async function generateRound(topics, difficulty, sourceMaterial, round = 'jeopardy') {
  const prompt = buildPrompt(topics, difficulty, sourceMaterial, round);
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating Jeopardy!-style trivia questions. You understand the format where clues are answers and responses must be in question format. You create engaging, accurate, and appropriately difficult questions.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0].message.content;
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

    return categories;
  } catch (error) {
    console.error('Error generating round:', error);
    throw error;
  }
}

async function generateFinalJeopardy(topics, difficulty, sourceMaterial) {
  const prompt = `Generate a Final Jeopardy clue for a Jeopardy!-style game show.

Requirements:
- One category
- One clue (the answer in Jeopardy format)
- One answer (in question format)

Difficulty level: ${difficulty || 'moderate'}

${topics ? `Topics/themes to focus on: ${topics}\n` : ''}
${sourceMaterial ? `Source material context: ${sourceMaterial.substring(0, 1000)}...\n` : ''}

Format your response as a JSON object:
{
  "category": "Category Name",
  "clue": "This is the answer that appears on screen",
  "answer": "What is the question format response?"
}

Important:
- The "clue" field is what contestants see (the answer in Jeopardy format)
- The "answer" field is what contestants must respond with (in question format)
- Make it appropriately challenging for Final Jeopardy
- Ensure it's interesting and engaging

Generate the Final Jeopardy clue now:`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at creating Jeopardy!-style trivia questions, especially challenging Final Jeopardy clues.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
      category: parsed.category,
      clue: parsed.clue,
      answer: parsed.answer,
    };
  } catch (error) {
    console.error('Error generating Final Jeopardy:', error);
    throw error;
  }
}

async function generateGame(prompt, difficulty, sourceMaterial) {
  const sourceText = await parseSourceMaterial(sourceMaterial);
  
  // Extract topics from prompt if not explicitly provided
  const topics = prompt || 'General knowledge';

  try {
    // Generate both rounds and Final Jeopardy in parallel
    const [jeopardyCategories, doubleJeopardyCategories, finalJeopardy] = await Promise.all([
      generateRound(topics, difficulty, sourceText, 'jeopardy'),
      generateRound(topics, difficulty, sourceText, 'doubleJeopardy'),
      generateFinalJeopardy(topics, difficulty, sourceText),
    ]);

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

    return gameConfig;
  } catch (error) {
    console.error('Error generating game:', error);
    throw error;
  }
}

module.exports = {
  generateGame,
  generateRound,
  generateFinalJeopardy,
};

