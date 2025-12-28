import type { Round } from '@/shared/types';

/**
 * These prompts are used to generate the game content during the client-side create-game flow.
 */

interface BasePromptOptions {
  topics: string;
  difficulty: string;
  sourceMaterial?: string;
}

interface SamplePromptOptions extends BasePromptOptions {
  categoryCount?: number;
  totalClues?: number;
  values?: number[];
}

interface RegenerationPromptOptions extends SamplePromptOptions {
  feedback: string;
}

interface RoundPromptOptions extends BasePromptOptions {
  round: Round;
  values: number[];
  excludedAnswers?: string[];
  feedbackHistory?: string[];
}

interface FinalJeopardyPromptOptions extends BasePromptOptions {
  excludedAnswers?: string[];
  feedbackHistory?: string[];
}

interface SingleClueRegenerationPromptOptions extends BasePromptOptions {
  categoryName: string;
  round: Round;
  value: number;
  currentClue: string;
  currentAnswer: string;
}

const DEFAULT_SAMPLE_VALUES = [200, 600, 1000];
const DEFAULT_SAMPLE_CATEGORY_COUNT = 6;
const DEFAULT_SAMPLE_CLUE_COUNT = 12;

const DIFFICULTY_GUIDELINES = `Difficulty Definitions:
* 200: \"Gimme\" fact—broadly known even to casual viewers.
* 400: Accessible detail that most attentive people can recall.
* 600: Trivia-enthusiast territory—specific but still reasonable.
* 800: Deep knowledge or multi-step connection across facts.
* 1000: Expert-only detail, obscure connections, or nuanced insight.

800 and 1000-value clues should have answers that are NOT a very well-known name (of a movie, song, a person, etc) unless the clue itself is very obscure. For example, if the answer is "Blade Runner", the clue should not be "The 1982 Riddley Scott film starring Harrison Ford" or the like. Better, make the answers themselves relatively hard. 
 `;

const BOARD_GUIDELINES = `Board composition:
* Balance subjects—mix academics, pop culture, wordplay, and general knowledge.
* Always write five clues per category with steadily rising difficulty/value.
* Favor clever, punny, or descriptive titles reminiscent of classic Jeopardy boards.`;

const CLUE_GUIDELINES = `Clue writing expectations:
* Phrase clues as answers; responses must be in question form (\"What/who is...?\" etc.).
* Clues should be at MOST 40 tokens (about 100 characters) long.
* Provide exactly one unambiguous correct response—avoid multi-answer ambiguity.
* Escalate difficulty with each value and keep clues concise but information-rich.
* Verify every fact; give enough context for contestants to reason to the response.
* Do NOT include any part of the category or of the clue in the answer.
* Do NOT include the answer (or parts of it) in the category name.
* Do NOT use swear words or offensive language.`;

const CATEGORY_RULES = `Category Creation Rules:
1.  **NO 1:1 MAPPING**: Do NOT simply create one category per provided topic. This is critical.
2.  **MIX & BLEND**: Use the provided topics as a palette. A single category should ideally touch on multiple themes or blend a theme with general knowledge (e.g., "Chemistry in Movies", "Kings of Chess", "Pokemon Etymology").
3.  **GENERAL KNOWLEDGE BALANCE**: The game should be accessible. Avoid deep specialist knowledge unless the difficulty is set very high. The topics are flavor/inspiration, not a syllabus.
4.  **CLASSIC STYLING**: Use puns, wordplay, and clever titles ("Potent Potables", "Before & After").
5.  **VARIETY**: Ensure the board has a mix of academic, pop culture, and wordplay categories.`;

function formatSourceMaterial(sourceMaterial?: string) {
  if (!sourceMaterial?.trim()) return '';
  const trimmed = sourceMaterial.trim();
  const snippet =
    trimmed.length > 12000 ? `${trimmed.slice(0, 12000)}…` : trimmed;
  return `Source material (priority context):\n${snippet}\n`;
}

function formatExcludedAnswers(excludedAnswers?: string[]) {
  if (!excludedAnswers || excludedAnswers.length === 0) return '';
  return `\nCRITICAL: Do NOT reuse any of these answers from previous rounds. Each answer must be completely unique across all rounds:\n${excludedAnswers
    .map((answer) => `- ${answer}`)
    .join(
      '\n',
    )}\n\nAdditionally, ensure that your clues are substantially different from previous rounds—avoid similar phrasing, topics, or approaches even if the answers differ.`;
}

function formatFeedbackHistory(feedbackHistory?: string[]) {
  if (!feedbackHistory || feedbackHistory.length === 0) return '';
  return `\nIMPORTANT: During the sample clue generation phase, the host provided the following feedback. Please keep these preferences in mind when creating the full game:\n\n${feedbackHistory
    .map((feedback, index) => `Feedback ${index + 1}: ${feedback}`)
    .join('\n\n')}\n`;
}

export function getSystemInstructions(): string {
  return `You are an expert Jeopardy! game creator working with a host to co-design bespoke rounds.
You excel at:
- Translating messy ideas into well-structured categories that feel classic yet bespoke.
- Maintaining the Jeopardy answer/question convention (clue = answer; answer = question).
- Keeping gameplay balanced across values and rounds.

${DIFFICULTY_GUIDELINES}

${BOARD_GUIDELINES}

${CLUE_GUIDELINES}

${CATEGORY_RULES}

IMPORTANT:
- Return ONLY plain text for all categories, clues, and answers. 
- Do NOT use Markdown formatting (no bolding, no italics, etc.) within the JSON values.
- Always respond with JSON that can be parsed reliably.`;
}

export function getInitialSamplePrompt(options: SamplePromptOptions): string {
  const {
    topics,
    difficulty,
    sourceMaterial,
    categoryCount = DEFAULT_SAMPLE_CATEGORY_COUNT,
    totalClues = DEFAULT_SAMPLE_CLUE_COUNT,
    values = DEFAULT_SAMPLE_VALUES,
  } = options;

  return `The host wants to explore a new Jeopardy game. Treat this as the start of a persistent conversation where later turns may refine your work.

Goals:
1. Suggest ${categoryCount} sample categories showcasing how their topics might blend.
2. Provide ${totalClues} total clues spread sparsely across those categories (1–2 per category).
3. Use clue values drawn from ${values.join(', ')} to demonstrate min/med/max difficulty.

Remember:
- Balance the sample board the way a Jeopardy head writer would (mix subjects, punny titles, tight focus).
- NO 1:1 MAPPING: Do NOT simply create one category per provided topic. Use topics as inspiration/flavor.
- Every clue must follow the clue-writing expectations outlined above (single definitive response, escalating difficulty, concise phrasing).
- CRITICAL: Answers must NOT appear in the category names or clues, and vice versa.

Topics / themes: ${topics}
Requested difficulty: ${difficulty}
${formatSourceMaterial(sourceMaterial)}

Output format (JSON object):
{
  "commentary": "Short paragraph explaining how you interpreted the request",
  "categories": [
    {
      "name": "Category Name",
      "clues": [
        { "value": 200, "clue": "on-screen answer text", "answer": "What/who is...?" }
      ]
    }
  ]
}

Keep the commentary concise (<= 3 sentences). Each clue must clearly map back to the provided topics.`;
}

export function getRegenerationPrompt(
  options: RegenerationPromptOptions,
): string {
  const {
    topics,
    difficulty,
    sourceMaterial,
    categoryCount = DEFAULT_SAMPLE_CATEGORY_COUNT,
    totalClues = DEFAULT_SAMPLE_CLUE_COUNT,
    values = DEFAULT_SAMPLE_VALUES,
    feedback,
  } = options;

  return `Update the sample set again, following the earlier instructions in this conversation.

IMPORTANT: Maintain consistency with the original game parameters:
Topics / themes: ${topics}
Requested difficulty: ${difficulty}
${formatSourceMaterial(sourceMaterial)}

Host feedback to apply:
${feedback}

Requirements recap:
- ${categoryCount} categories, ${totalClues} total clues (sparse, 1–2 per category).
- Use clue values from ${values.join(', ')}.
- Return the same JSON structure with "commentary" plus "categories".
- Every clue must still map back to the original topics/themes provided above.

Highlight the adjustments you made in the commentary.`;
}

export function getFullRoundPrompt(options: RoundPromptOptions): string {
  const {
    topics,
    difficulty,
    sourceMaterial,
    round,
    values,
    excludedAnswers,
    feedbackHistory,
  } = options;
  const roundName =
    round === 'doubleJeopardy'
      ? 'Double Jeopardy'
      : round === 'finalJeopardy'
        ? 'Final Jeopardy'
        : 'Jeopardy';

  const uniquenessNote =
    excludedAnswers && excludedAnswers.length > 0
      ? `\nIMPORTANT: This is the ${roundName} round. All answers and clues must be completely unique from previous rounds. Do not reuse answers, and ensure clues cover different aspects, angles, or details than those already used.`
      : '';

  const roundSpecificInstructions =
    round === 'doubleJeopardy'
      ? `\nROUND 2 (DOUBLE JEOPARDY) FOCUS:
- This round must feel DISTINCT from Round 1.
- Avoid reusing standard/obvious categories derived from the themes.
- Focus on more clever, lateral, or "second-degree" connections to the topics.
- Increase the complexity of the category themes (e.g., more wordplay or cross-referencing topics).`
      : `\nROUND 1 (JEOPARDY) FOCUS:
- Establish a fun, accessible board.
- Mix the provided topics into broader general knowledge categories.`;

  return `Generate a complete ${roundName} round (${values.length} clues per category, ${values.join(
    ', ',
  )} values).

  Core specs:
  ${roundSpecificInstructions}
  - 6 categories, each with ${values.length} clues.
- Maintain strict clue difficulty progression with the provided values.
- Follow Jeopardy formatting (clue = answer; answer = question).

Board & clue guardrails:
- Balance subjects, mix wordplay with academic and pop culture prompts, and keep titles clever.
- Each category must contain exactly ${values.length} clues with steadily increasing difficulty/value.
- Clues read as answers; responses stay in question form ("What/who is...?").
- Every clue has one unambiguous correct response, verified facts, and enough context for deduction.
${uniquenessNote}

Topics / themes: ${topics}
Requested difficulty: ${difficulty}
${formatSourceMaterial(sourceMaterial)}
${formatExcludedAnswers(excludedAnswers)}${formatFeedbackHistory(feedbackHistory)}

Output JSON:
{
  "categories": [
    {
      "name": "Category",
      "clues": [
        { "value": ${values[0]}, "clue": "answer text", "answer": "What/who is ... ?" }
      ]
    }
  ]
}

Do not include commentary. Focus on balanced, television-ready material.`;
}

export function getFinalJeopardyPrompt(
  options: FinalJeopardyPromptOptions,
): string {
  const {
    topics,
    difficulty,
    sourceMaterial,
    excludedAnswers,
    feedbackHistory,
  } = options;
  const uniquenessNote =
    excludedAnswers && excludedAnswers.length > 0
      ? `\nCRITICAL: The Final Jeopardy answer must be completely unique from all previous rounds. Do not reuse any answers from the Jeopardy or Double Jeopardy rounds, and ensure the clue approaches the topic from a distinct angle.`
      : '';

  return `Generate a Final Jeopardy prompt.
${uniquenessNote}

Topics / themes: ${topics}
Requested difficulty: ${difficulty}
${formatSourceMaterial(sourceMaterial)}
${formatExcludedAnswers(excludedAnswers)}${formatFeedbackHistory(feedbackHistory)}

JSON format:
{
  "category": "Category Name",
  "clue": "Answer text shown to contestants",
  "answer": "What/who is ... ?"
}

Final Jeopardy guardrails:
- Keep the category resonant with the provided topics but styled like classic show material.
- The Final Jeopardy category should ideally tie together multiple themes or focus on a major one in a new way.
- Phrase the clue as an answer, keep it concise, accurate, and challenging.
- Provide a single definitive response in question form ("What/who is...?").
- The answer and clue must be completely unique from all previous rounds.

Ensure the clue ties to the topics and meets Final Jeopardy gravitas.`;
}

export function getSingleClueRegenerationPrompt(
  options: SingleClueRegenerationPromptOptions,
): string {
  const {
    topics,
    difficulty,
    sourceMaterial,
    categoryName,
    round,
    value,
    currentClue,
    currentAnswer,
  } = options;
  const roundName =
    round === 'doubleJeopardy'
      ? 'Double Jeopardy'
      : round === 'finalJeopardy'
        ? 'Final Jeopardy'
        : 'Jeopardy';

  return `Generate a new clue to replace an existing one in the game.

Context:
- Round: ${roundName}
- Category: ${categoryName}
- Value: ${value}
- Current clue being replaced: "${currentClue}"
- Current answer being replaced: "${currentAnswer}"

Requirements:
- Generate a NEW clue for the same category, round, and value
- The new clue must fit the same difficulty level (${value} points)
- Maintain consistency with the category theme
- Follow all clue-writing guidelines (Jeopardy format, single unambiguous answer, etc.)

Topics / themes: ${topics}
Requested difficulty: ${difficulty}
${formatSourceMaterial(sourceMaterial)}

Output JSON:
{
  "clue": "New answer text for the clue",
  "answer": "What/who is ... ?"
}

Generate a fresh, high-quality clue that matches the category and difficulty level.`;
}
