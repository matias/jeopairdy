import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Store Gemini chat sessions in memory (keyed by conversationId)
const geminiChats = new Map<string, any>();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      model = 'chatgpt-5.1',
      conversationId,
      instructions,
      message,
      format = 'json_object',
      useGoogleSearchGrounding = false,
    }: {
      model?: 'chatgpt-5.1' | 'gemini-3-pro';
      conversationId?: string | null;
      instructions?: string;
      message?: string;
      format?: 'json_object' | 'text';
      useGoogleSearchGrounding?: boolean;
    } = body ?? {};

    if (typeof message !== 'string' || message.trim() === '') {
      return NextResponse.json(
        { error: 'message is required.' },
        { status: 400 },
      );
    }

    console.log('[Generate API] Request received', {
      model,
      conversationId: conversationId || 'new',
      format,
      useGoogleSearchGrounding:
        model === 'gemini-3-pro' ? useGoogleSearchGrounding : false,
      messageLength: message.length,
    });

    // Route to appropriate model
    if (model === 'gemini-3-pro') {
      return await handleGeminiRequest({
        conversationId,
        instructions,
        message,
        format,
        useGoogleSearchGrounding,
      });
    } else {
      return await handleOpenAIRequest({
        conversationId,
        instructions,
        message,
        format,
      });
    }
  } catch (error: any) {
    console.error('[Generate API] Top-level error', {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      response: error?.response?.data,
    });
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

async function handleOpenAIRequest({
  conversationId,
  instructions,
  message,
  format,
}: {
  conversationId?: string | null;
  instructions?: string;
  message: string;
  format: 'json_object' | 'text';
}) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'Missing OPENAI_API_KEY environment variable.' },
      { status: 500 },
    );
  }

  let activeConversationId = conversationId;

  if (!activeConversationId) {
    if (typeof instructions !== 'string' || instructions.trim() === '') {
      return NextResponse.json(
        {
          error: 'instructions are required when creating a new conversation.',
        },
        { status: 400 },
      );
    }

    console.log('[OpenAI] Creating new conversation');
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
    console.log('[OpenAI] Conversation created', {
      conversationId: activeConversationId,
    });
  } else {
    console.log('[OpenAI] Using existing conversation', {
      conversationId: activeConversationId,
    });
  }

  console.log('[OpenAI] Sending request', {
    model: 'gpt-5.1',
    conversationId: activeConversationId,
    format,
  });

  try {
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

    const tokenUsage: Record<string, number | undefined> = {};
    if (response.usage) {
      // Handle different possible property names
      tokenUsage.promptTokens =
        (response.usage as any).prompt_tokens ||
        (response.usage as any).promptTokens;
      tokenUsage.completionTokens =
        (response.usage as any).completion_tokens ||
        (response.usage as any).completionTokens;
      tokenUsage.totalTokens =
        (response.usage as any).total_tokens ||
        (response.usage as any).totalTokens;
    }

    console.log('[OpenAI] Response received', {
      conversationId: activeConversationId,
      ...tokenUsage,
      outputLength: response.output_text?.length || 0,
    });

    return NextResponse.json({
      conversationId: activeConversationId,
      output_text: response.output_text,
    });
  } catch (error: any) {
    console.error('[OpenAI] Request failed', {
      conversationId: activeConversationId,
      error: error?.message || 'Unknown error',
      status: error?.status,
    });
    throw error;
  }
}

async function handleGeminiRequest({
  conversationId,
  instructions,
  message,
  format,
  useGoogleSearchGrounding,
}: {
  conversationId?: string | null;
  instructions?: string;
  message: string;
  format: 'json_object' | 'text';
  useGoogleSearchGrounding: boolean;
}) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'Missing GEMINI_API_KEY environment variable.' },
      { status: 500 },
    );
  }

  let activeConversationId = conversationId;
  let chat = activeConversationId
    ? geminiChats.get(activeConversationId)
    : null;

  // Create new chat if needed
  if (!chat) {
    if (typeof instructions !== 'string' || instructions.trim() === '') {
      return NextResponse.json(
        {
          error: 'instructions are required when creating a new conversation.',
        },
        { status: 400 },
      );
    }

    // Generate a conversation ID if not provided
    if (!activeConversationId) {
      activeConversationId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    // Build config with system instruction and optional Google Search tool
    const config: any = {
      systemInstruction: instructions,
    };

    if (useGoogleSearchGrounding) {
      config.tools = [{ googleSearch: {} }];
    }

    console.log('[Gemini] Creating new chat', {
      conversationId: activeConversationId,
      model: 'gemini-3-pro-preview',
      useGoogleSearchGrounding,
    });

    // Create new chat with system instructions
    chat = gemini.chats.create({
      model: 'gemini-3-pro-preview',
      config,
    });

    geminiChats.set(activeConversationId, chat);
  } else {
    console.log('[Gemini] Using existing chat', {
      conversationId: activeConversationId,
    });
  }

  console.log('[Gemini] Sending message', {
    conversationId: activeConversationId,
    format,
  });

  try {
    // Send message to chat
    const response = await chat.sendMessage({
      message,
    });

    // Extract text from response using the text property
    let outputText = response.text || '';

    // If format is json_object, try to extract JSON from response
    if (format === 'json_object' && outputText) {
      // Try to extract JSON from markdown code blocks or plain text
      const jsonMatch =
        outputText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) ||
        outputText.match(/(\{[\s\S]*\})/);
      if (jsonMatch) {
        outputText = jsonMatch[1];
      }
    }

    const tokenUsage = response.usageMetadata
      ? {
          promptTokens: response.usageMetadata.promptTokenCount,
          completionTokens: response.usageMetadata.candidatesTokenCount,
          totalTokens: response.usageMetadata.totalTokenCount,
          cachedTokens: response.usageMetadata.cachedContentTokenCount,
        }
      : {};

    console.log('[Gemini] Response received', {
      conversationId: activeConversationId,
      ...tokenUsage,
      outputLength: outputText.length,
      finishReason: response.candidates?.[0]?.finishReason,
    });

    return NextResponse.json({
      conversationId: activeConversationId,
      output_text: outputText,
    });
  } catch (error: any) {
    console.error('[Gemini] Request failed', {
      conversationId: activeConversationId,
      error: error?.message || 'Unknown error',
      status: error?.status,
    });
    throw error;
  }
}
