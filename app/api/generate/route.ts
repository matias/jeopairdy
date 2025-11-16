import OpenAI from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Missing OPENAI_API_KEY environment variable.' },
      { status: 500 },
    );
  }

  try {
    const body = await req.json();
    const {
      conversationId,
      instructions,
      message,
      format = 'json_object',
    }: {
      conversationId?: string | null;
      instructions?: string;
      message?: string;
      format?: 'json_object' | 'text';
    } = body ?? {};

    if (typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json({ error: 'message is required.' }, { status: 400 });
    }

    let activeConversationId = conversationId;

    if (!activeConversationId) {
      if (typeof instructions !== 'string' || instructions.trim() === '') {
        return NextResponse.json(
          { error: 'instructions are required when creating a new conversation.' },
          { status: 400 },
        );
      }

      const conversation = await openai.conversations.create({
        items: [
          {
            type: 'message',
            role: 'developer',
            content: [
              {
                type: 'input_text',
                text: instructions,
              },
            ],
          },
        ],
      });

      activeConversationId = conversation.id;
    }

    const response = await openai.responses.create({
      model: 'gpt-5.1',
      conversation: activeConversationId,
      input: [
        {
          type: 'message',
          role: 'user',
          content: message,
        },
      ],
      text: {
        format: {
          type: format === 'text' ? 'text' : 'json_object',
        },
      },
    });

    return NextResponse.json({
      conversationId: activeConversationId,
      output_text: response.output_text,
    });
  } catch (error: any) {
    console.error('[Generate API] Error:', error);
    return NextResponse.json(
      {
        error:
          error?.response?.data?.error?.message ||
          error?.message ||
          'Failed to generate content.',
      },
      { status: 500 },
    );
  }
}

