import {
  type Message,
  createDataStreamResponse,
  smoothStream,
  streamText,
  type CoreUserMessage,
  type CoreAssistantMessage,
  type CoreSystemMessage,
} from 'ai';

import { auth } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/models';
import { systemPrompt } from '@/lib/ai/prompts';
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import {
  generateUUID,
  getMostRecentUserMessage,
  sanitizeResponseMessages,
} from '@/lib/utils';

import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';

export const maxDuration = 60;

export async function POST(request: Request) {
  const {
    id,
    messages,
    selectedChatModel,
  }: { id: string; messages: Array<Message>; selectedChatModel: string } =
    await request.json();

  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userMessage = getMostRecentUserMessage(messages);

  if (!userMessage) {
    return new Response('No user message found', { status: 400 });
  }

  const chat = await getChatById({ id });

  if (!chat) {
    const title = await generateTitleFromUserMessage({ message: userMessage });
    await saveChat({ id, userId: session.user.id, title });
  }

  await saveMessages({
    messages: [{ ...userMessage, createdAt: new Date(), chatId: id }],
  });

  const isInvoiceProcessing = userMessage.content?.toLowerCase().includes('process this invoice');
  const invoiceSystemPrompt = `You are an expert invoice processor with advanced capabilities in analyzing both PDF documents and images. Your task is to extract and structure the following information:

  REQUIRED FIELDS (mark as 'Not Found' if missing):
  - Invoice Number
  - Invoice Date
  - Due Date
  - Amount
  - Customer name
  - Vendor name
  
  ADDITIONAL FIELDS (if present):
  - Line Items (including quantity, description, unit price, total)
  - Subtotal
  - Tax Amount
  - Payment Terms
  - Payment Instructions
  - Purchase Order Reference
  
  VALIDATION CHECKS:
  - Verify mathematical accuracy of totals
  - Check for missing required fields
  - Flag any unusual or suspicious elements
  
  FORMAT YOUR RESPONSE AS FOLLOWS:
  1. First, provide a brief summary of the document type and quality
  2. Then list all found fields in a structured format
  3. Finally, note any discrepancies, missing fields, or potential issues
  
  If the provided file is not an invoice, politely inform the user and explain why.`;
  
  const finalSystemPrompt = isInvoiceProcessing ? invoiceSystemPrompt : systemPrompt({ selectedChatModel });

  // Transform messages to include file attachments in the correct format
  const transformedMessages = messages.map(message => {
    const base = {
      id: message.id,
      role: message.role,
    };

    if (message.experimental_attachments?.length) {
      const attachments = message.experimental_attachments.map(attachment => {
        const url = attachment.url;
        const isPDF = attachment.contentType === 'application/pdf';
        
        if (isPDF) {
          const base64Data = url.split(',')[1];
          return {
            type: 'file' as const,
            data: base64Data,
            mimeType: attachment.contentType,
            filename: attachment.name,
          };
        } else {
          return {
            type: 'image' as const,
            image: new URL(url)
          };
        }
      });

      return {
        ...base,
        content: [
          { type: 'text' as const, text: message.content || '' },
          ...attachments,
        ],
      } as CoreUserMessage | CoreAssistantMessage | CoreSystemMessage;
    }

    return {
      ...base,
      content: message.content,
    } as CoreUserMessage | CoreAssistantMessage | CoreSystemMessage;
  });

  // Add expires to session for tool compatibility
  const sessionWithExpires = {
    ...session,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };

  // Set up timeout for 30 seconds
  const timeoutMs = 30000;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Processing timeout after 30 seconds')), timeoutMs);
  });

  return createDataStreamResponse({
    execute: async (dataStream) => {
      try {
        const streamPromise = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: finalSystemPrompt,
          messages: transformedMessages,
          maxSteps: 5,
          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : [
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                ],
          experimental_transform: smoothStream({ 
            chunking: 'word',
          }),
          experimental_generateMessageId: generateUUID,
          tools: {
            getWeather,
            createDocument: createDocument({ session: sessionWithExpires, dataStream }),
            updateDocument: updateDocument({ session: sessionWithExpires, dataStream }),
            requestSuggestions: requestSuggestions({
              session: sessionWithExpires,
              dataStream,
            }),
          },
          onFinish: async ({ response, reasoning }) => {
            if (session.user?.id) {
              try {
                const sanitizedResponseMessages = sanitizeResponseMessages({
                  messages: response.messages,
                  reasoning,
                });

                await saveMessages({
                  messages: sanitizedResponseMessages.map((message) => ({
                    id: message.id,
                    chatId: id,
                    role: message.role,
                    content: message.content,
                    createdAt: new Date(),
                  })),
                });
              } catch (error) {
                console.error('Failed to save chat:', error);
              }
            }
          },
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'stream-text',
          },
        });

        // Race between the stream and timeout
        await Promise.race([
          streamPromise.mergeIntoDataStream(dataStream, {
            sendReasoning: true,
          }),
          timeoutPromise
        ]);

      } catch (error: any) {
        if (error?.message === 'Processing timeout after 30 seconds') {
          console.error('Processing timeout occurred');
        }
        throw error;
      }
    },
    onError: (error: unknown) => {
      console.error('Error in chat stream:', error);
      if (error instanceof Error && error.message === 'Processing timeout after 30 seconds') {
        return 'The invoice processing took too long to complete. Please try again with a smaller file or contact support if the issue persists.';
      }
      return 'An error occurred while processing your invoice. Please ensure the file is a valid invoice document and try again.';
    },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new Response('Not Found', { status: 404 });
  }

  const session = await auth();

  if (!session || !session.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const chat = await getChatById({ id });

    await deleteChatById({ id });

    return new Response('Chat deleted', { status: 200 });
  } catch (error) {
    return new Response('An error occurred while processing your request', {
      status: 500,
    });
  }
}
