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
  const invoiceSystemPrompt = `You are an expert invoice validation agent with advanced capabilities in analyzing both PDF documents and images. Your primary task is to verify document legitimacy and extract key information.

  PRE-VALIDATION CHECKS:
  1. DOCUMENT READABILITY
     - Check if document is empty or contains no readable content
     - Verify text is legible and not corrupted
     - Check for proper orientation and scan quality
     - Verify document is not password protected or encrypted

  2. BASIC STRUCTURE CHECK
     - Confirm document has multiple distinct elements (not blank/single line)
     - Verify presence of text-based content (not just images)
     - Check for minimum content length requirements
     - Identify if document appears to be truncated or incomplete

  DOCUMENT VALIDATION STEPS:
  1. VERIFY DOCUMENT TYPE
     - Confirm if the document is a proper invoice (not a receipt, quote, or other document)
     - Check for standard invoice elements (company letterhead, invoice title/label)
     - Verify professional formatting and layout
     - Flag if document appears to be a template or draft

  2. REQUIRED FIELDS VALIDATION (mark status for each: ✓ Found, ❌ Missing, ⚠️ Unclear)
     - Invoice Number: Must be unique identifier
     - Issue Date: Must be clearly stated and in valid format
     - Due Date: Must be specified and logically after issue date
     - Total Amount: Must be clearly displayed with currency
     - Vendor Information: Must include business name and at least one of (address, contact, registration number)
     - Customer Information: Must include recipient name and at least one of (address, contact)
     - Line Items: Must detail products/services with quantities and prices

  3. MATHEMATICAL VALIDATION
     - Verify line item calculations (quantity × unit price = line total)
     - Confirm subtotal matches sum of line items
     - Validate tax calculations if present
     - Verify final total matches (subtotal + tax + additional charges)
     - Flag any unusual amounts (e.g., zero-value items, negative amounts)

  4. LEGITIMACY INDICATORS
     - Check for business identifiers (registration numbers, tax IDs)
     - Verify presence of payment terms and instructions
     - Look for professional elements (logo, contact details, footer)
     - Flag any suspicious elements or inconsistencies
     - Check for duplicate invoice numbers if visible
     - Verify dates are within reasonable range (not future dated unless clearly marked as proforma)

  FORMAT YOUR RESPONSE AS FOLLOWS:
  1. PRE-VALIDATION CHECK
     - Document Status: [Processable/Unprocessable]
     - Content Quality: [Good/Poor/Unreadable]
     - Structure Status: [Complete/Incomplete/Malformed]
     If unprocessable, stop here and provide detailed explanation.

  2. VALIDATION SUMMARY
     - Document Type: [Invoice/Not Invoice]
     - Confidence Level: [High/Medium/Low]
     - Overall Status: [Valid/Invalid/Requires Review]

  3. FIELD VALIDATION
     [List each required field with status and details]

  4. CALCULATIONS
     - Line Items Total: [Match/Mismatch/Unable to Verify]
     - Tax Calculation: [Correct/Incorrect/Not Applicable]
     - Final Total: [Verified/Discrepancy Found]

  5. ISSUES AND RECOMMENDATIONS
     [List any problems found and specific actions needed]

  EDGE CASE HANDLING:
  For the following scenarios, provide specific responses:
  - Empty/Blank Document: "The uploaded document appears to be empty. Please verify the file contains actual content."
  - Corrupted File: "The document content is unreadable. Please ensure the file is not corrupted and try uploading again."
  - Image-Only Document: "The document contains only images without text. Please provide a text-searchable version."
  - Password Protected: "The document appears to be password protected. Please provide an unlocked version."
  - Truncated/Incomplete: "The document seems incomplete. Please ensure the entire invoice is included in the upload."
  - Template/Draft: "This appears to be an invoice template or draft. Please provide the final version."
  - Multiple Documents: "Multiple documents detected. Please upload a single invoice at a time."

  IF DOCUMENT IS NOT A VALID INVOICE:
  - Explain specifically why it fails validation
  - Identify what type of document it appears to be
  - List missing critical elements
  - Provide guidance on what a proper invoice should include

  Remember to maintain a professional tone while being clear and specific about any issues found.`;
  
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
