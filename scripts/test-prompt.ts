#!/usr/bin/env tsx

// Standalone prompt builder using prompts.ts functions
import {
  getSystemInstructions,
  getInitialSamplePrompt,
  getRegenerationPrompt,
  getFullRoundPrompt,
  getFinalJeopardyPrompt,
} from '../lib/prompts';
import type { Round } from '../shared/types';

type Mode = 'sample' | 'full' | 'final';

interface CliOptions {
  mode: Mode;
  topics: string;
  difficulty: string;
  round: Round;
  sourceMaterial?: string;
  feedback?: string;
  categoryCount?: number;
  totalClues?: number;
  excludedAnswers?: string[];
}

// Parse command line arguments
const args = process.argv.slice(2);

// Default values
const options: CliOptions = {
  mode: 'full',
  topics: 'General knowledge',
  difficulty: 'medium',
  round: 'jeopardy',
};

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--mode' || arg === '-m') {
    const mode = args[++i];
    if (mode === 'sample' || mode === 'full' || mode === 'final') {
      options.mode = mode;
    } else {
      console.error(
        `Invalid mode: ${mode}. Must be 'sample', 'full', or 'final'`,
      );
      process.exit(1);
    }
  } else if (arg === '--topics' || arg === '-t') {
    options.topics = args[++i] || options.topics;
  } else if (arg === '--difficulty' || arg === '-d') {
    options.difficulty = args[++i] || options.difficulty;
  } else if (arg === '--round' || arg === '-r') {
    const round = args[++i];
    if (
      round === 'jeopardy' ||
      round === 'doubleJeopardy' ||
      round === 'finalJeopardy'
    ) {
      options.round = round as Round;
    } else {
      console.error(
        `Invalid round: ${round}. Must be 'jeopardy', 'doubleJeopardy', or 'finalJeopardy'`,
      );
      process.exit(1);
    }
  } else if (arg === '--source' || arg === '-s') {
    options.sourceMaterial = args[++i];
  } else if (arg === '--feedback' || arg === '-f') {
    options.feedback = args[++i];
  } else if (arg === '--category-count' || arg === '-c') {
    options.categoryCount = parseInt(args[++i] || '4', 10);
  } else if (arg === '--total-clues' || arg === '--clues') {
    options.totalClues = parseInt(args[++i] || '6', 10);
  } else if (arg === '--excluded-answers' || arg === '-e') {
    const answersStr = args[++i];
    options.excludedAnswers = answersStr
      ? answersStr.split(',').map((a) => a.trim())
      : [];
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
Usage: tsx scripts/test-prompt.ts [options]

Options:
  -m, --mode <mode>              Mode: 'sample', 'full', or 'final' (default: "full")
  -t, --topics <text>            Topics/themes for the game (default: "General knowledge")
  -d, --difficulty <level>       Difficulty level: easy, medium, or hard (default: "medium")
  -r, --round <round>            Round type: "jeopardy" or "doubleJeopardy" (default: "jeopardy")
  -s, --source <text>            Source material context
  -f, --feedback <text>          Feedback for regeneration (sample mode only)
  -c, --category-count <number>  Number of categories for sample mode (default: 4)
  --clues, --total-clues <num>   Total clues for sample mode (default: 6)
  -e, --excluded-answers <list>  Comma-separated list of answers to exclude
  -h, --help                     Show this help message

Examples:
  # Generate a full round prompt
  tsx scripts/test-prompt.ts --mode full --topics "World History" --difficulty medium --round jeopardy

  # Generate a sample prompt
  tsx scripts/test-prompt.ts --mode sample --topics "Science Fiction" --difficulty hard -c 4 --clues 6

  # Generate a Final Jeopardy prompt
  tsx scripts/test-prompt.ts --mode final --topics "Movies" --difficulty medium

  # Generate with excluded answers
  tsx scripts/test-prompt.ts --mode full --topics "Sports" --round doubleJeopardy -e "Michael Jordan,LeBron James"
`);
    process.exit(0);
  }
}

// Generate the appropriate prompt based on mode
let userPrompt: string;
let systemPrompt: string;

switch (options.mode) {
  case 'sample':
    if (options.feedback) {
      userPrompt = getRegenerationPrompt({
        topics: options.topics,
        difficulty: options.difficulty,
        sourceMaterial: options.sourceMaterial,
        categoryCount: options.categoryCount,
        totalClues: options.totalClues,
        feedback: options.feedback,
      });
    } else {
      userPrompt = getInitialSamplePrompt({
        topics: options.topics,
        difficulty: options.difficulty,
        sourceMaterial: options.sourceMaterial,
        categoryCount: options.categoryCount,
        totalClues: options.totalClues,
      });
    }
    systemPrompt = getSystemInstructions();
    break;

  case 'full':
    const values =
      options.round === 'doubleJeopardy'
        ? [400, 800, 1200, 1600, 2000]
        : [200, 400, 600, 800, 1000];

    userPrompt = getFullRoundPrompt({
      topics: options.topics,
      difficulty: options.difficulty,
      sourceMaterial: options.sourceMaterial,
      round: options.round,
      values,
      excludedAnswers: options.excludedAnswers,
    });
    systemPrompt = getSystemInstructions();
    break;

  case 'final':
    userPrompt = getFinalJeopardyPrompt({
      topics: options.topics,
      difficulty: options.difficulty,
      sourceMaterial: options.sourceMaterial,
      excludedAnswers: options.excludedAnswers,
    });
    systemPrompt = getSystemInstructions();
    break;
}

// Output the prompts
console.log('='.repeat(80));
console.log('SYSTEM INSTRUCTIONS');
console.log('='.repeat(80));
console.log(systemPrompt);
console.log('\n');
console.log('='.repeat(80));
console.log('USER PROMPT');
console.log('='.repeat(80));
console.log(`Mode: ${options.mode}`);
console.log(`Topics: ${options.topics}`);
console.log(`Difficulty: ${options.difficulty}`);
if (options.round) {
  console.log(`Round: ${options.round}`);
}
if (options.sourceMaterial) {
  console.log(`Source Material: ${options.sourceMaterial.substring(0, 50)}...`);
}
if (options.excludedAnswers && options.excludedAnswers.length > 0) {
  console.log(`Excluded Answers: ${options.excludedAnswers.length} answers`);
}
console.log('='.repeat(80));
console.log('\n');
console.log(userPrompt);
console.log('\n');
console.log('='.repeat(80));
