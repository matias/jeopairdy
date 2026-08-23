import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Store Gemini chat sessions in memory (keyed by conversationId)
const geminiChats = new Map<string, any>();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      conversationId,
      instructions,
      message,
      format = 'json_object',
      useGoogleSearchGrounding = false,
    }: {
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
      conversationId: conversationId || 'new',
      format,
      useGoogleSearchGrounding,
      messageLength: message.length,
    });

    return await handleGeminiRequest({
      conversationId,
      instructions,
      message,
      format,
      useGoogleSearchGrounding,
    });
  } catch (error: any) {
    console.error('[Generate API] Top-level error', {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      response: error?.response?.data,
    });
    return NextResponse.json(
      {
        error: error?.message || 'Failed to generate content.',
      },
      { status: 500 },
    );
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

  // Create new chat if needed (or if conversation was lost due to cold start)
  if (!chat) {
    if (typeof instructions !== 'string' || instructions.trim() === '') {
      // If we had a conversationId but lost the session, give a more helpful error
      if (conversationId) {
        console.warn('[Gemini] Conversation not found (likely cold start)', {
          conversationId,
        });
        return NextResponse.json(
          {
            error:
              'Conversation expired or server restarted. Please include instructions to continue.',
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          error: 'instructions are required when creating a new conversation.',
        },
        { status: 400 },
      );
    }

    // Generate a new conversation ID (don't reuse old one to avoid confusion)
    activeConversationId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (conversationId) {
      console.log('[Gemini] Recovering lost conversation', {
        oldConversationId: conversationId,
        newConversationId: activeConversationId,
      });
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
      model: 'gemini-3.7-flash',
      useGoogleSearchGrounding,
    });

    // Create new chat with system instructions
    chat = gemini.chats.create({
      model: 'gemini-3.7-flash',
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
