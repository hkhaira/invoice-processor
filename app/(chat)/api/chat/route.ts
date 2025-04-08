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
  const invoiceSystemPrompt = `You are an expert invoice processor. Extract key information from the attached invoice including:
       - Invoice number
       - Date
       - Due date
       - Total amount
       - Line items
       - Vendor details
       - Payment terms
       Present the information in a clear, structured format.
       If any information is missing or unclear, note that in your response.
       If the file is not a valid invoice, politely inform the user.`;
  
  const finalSystemPrompt = isInvoiceProcessing ? invoiceSystemPrompt : systemPrompt({ selectedChatModel });

  // Transform messages to include file attachments in the correct format
  const transformedMessages = messages.map(message => {
    const base = {
      id: message.id,
      role: message.role,
    };

    if (message.experimental_attachments?.length) {
      // For data URLs, we need to extract the base64 data
      const attachments = message.experimental_attachments.map(attachment => {
        const url = attachment.url;
        const isPDF = attachment.contentType === 'application/pdf';
        
        if (isPDF) {
          // For PDFs, use file type with base64 data
          const base64Data = url.split(',')[1];
          return {
            type: 'file' as const,
            data: base64Data,
            mimeType: attachment.contentType,
            filename: attachment.name,
          };
        } else {
          // For images, use image type with URL
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
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
  };

  return createDataStreamResponse({
    execute: (dataStream) => {
      const result = streamText({
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
        experimental_transform: smoothStream({ chunking: 'word' }),
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
                messages: sanitizedResponseMessages.map((message) => {
                  return {
                    id: message.id,
                    chatId: id,
                    role: message.role,
                    content: message.content,
                    createdAt: new Date(),
                  };
                }),
              });
            } catch (error) {
              console.error('Failed to save chat');
            }
          }
        },
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'stream-text',
        },
      });

      result.mergeIntoDataStream(dataStream, {
        sendReasoning: true,
      });
    },
    onError: (error) => {
      console.error('Error in chat stream:', error);
      return 'Oops, an error occurred!';
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
