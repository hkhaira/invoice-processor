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
import { saveInvoice, type InvoiceData } from '@/lib/db/invoice-queries';

export const maxDuration = 60;

// Define the structured output schema for invoice data
const invoiceSchema = {
  type: 'object',
  properties: {
    validation: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['valid', 'invalid'] },
        errors: { type: 'array', items: { type: 'string' } }
      },
      required: ['status']
    },
    data: {
      type: 'object',
      properties: {
        invoiceNumber: { type: 'string' },
        issueDate: { type: 'string', format: 'date-time' },
        dueDate: { type: 'string', format: 'date-time' },
        totalAmount: { type: 'number' },
        currency: { type: 'string', default: 'USD' },
        customerName: { type: 'string' },
        customerAddress: { type: 'string' },
        customerContact: { type: 'string' },
        customerTaxId: { type: 'string' },
        vendorName: { type: 'string' },
        vendorAddress: { type: 'string' },
        vendorContact: { type: 'string' },
        vendorTaxId: { type: 'string' },
        paymentTerms: { type: 'string' },
        notes: { type: 'string' },
        lineItems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
              totalPrice: { type: 'number' },
              taxRate: { type: 'number' },
              taxAmount: { type: 'number' },
              sku: { type: 'string' },
              category: { type: 'string' }
            },
            required: ['description', 'quantity', 'unitPrice', 'totalPrice']
          }
        }
      },
      required: ['invoiceNumber', 'issueDate', 'dueDate', 'totalAmount', 'customerName', 'vendorName']
    }
  },
  required: ['validation', 'data']
};

// Add type for response format
type ResponseFormat = {
  type: 'json_object';
  schema?: Record<string, any>;
};

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

  2. REQUIRED FIELDS VALIDATION
     - Invoice Number: Must be unique identifier
     - Issue Date: Must be clearly stated and in valid format (YYYY-MM-DDTHH:mm:ss.sssZ)
     - Due Date: Must be specified and logically after issue date (YYYY-MM-DDTHH:mm:ss.sssZ)
     - Total Amount: Must be clearly displayed with currency (as decimal number)
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

  EDGE CASE HANDLING:
  For the following scenarios, set validation.status to "invalid" and include specific error in validation.errors:
  - Empty/Blank Document: "The uploaded document appears to be empty. Please verify the file contains actual content."
  - Corrupted File: "The document content is unreadable. Please ensure the file is not corrupted and try uploading again."
  - Image-Only Document: "The document contains only images without text. Please provide a text-searchable version."
  - Password Protected: "The document appears to be password protected. Please provide an unlocked version."
  - Truncated/Incomplete: "The document seems incomplete. Please ensure the entire invoice is included in the upload."
  - Template/Draft: "This appears to be an invoice template or draft. Please provide the final version."
  - Multiple Documents: "Multiple documents detected. Please upload a single invoice at a time."

  IF DOCUMENT IS NOT A VALID INVOICE:
  1. Set validation.status to "invalid"
  2. Include in validation.errors:
     - Specific reason why it fails validation
     - What type of document it appears to be
     - List of missing critical elements
     - Guidance on what a proper invoice should include

  RESPONSE FORMAT:
  You must respond with a JSON object matching this schema:
  ${JSON.stringify(invoiceSchema, null, 2)}

  If validation fails:
  - Set validation.status to "invalid"
  - Include detailed error messages in validation.errors array
  - Leave data fields as null or empty strings

  If validation succeeds:
  - Set validation.status to "valid"
  - Populate all required fields in the data object
  - Convert all monetary values to decimal numbers
  - Format dates in ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)
  - Include line items with proper calculations

  Remember:
  - Be precise with number formats (use decimal points for currency)
  - Ensure dates are in correct ISO format
  - Validate mathematical accuracy of line items
  - Include all available optional fields when present in the document
  - Maintain a professional tone while being clear and specific about any issues found`;

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
      content: message.content || '',
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
          // @ts-expect-error - response_format and structuredOutputs are supported in newer versions
          response_format: isInvoiceProcessing ? { type: "json_object", schema: invoiceSchema } : undefined,
          structuredOutputs: isInvoiceProcessing,
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

                // Save messages with proper content handling
                await saveMessages({
                  messages: sanitizedResponseMessages.map((message) => {
                    let content = message.content;
                    
                    // Handle array content type
                    if (Array.isArray(content)) {
                      content = content
                        .map(part => {
                          if (typeof part === 'string') return part;
                          if (part.type === 'text') return part.text;
                          return '';
                        })
                        .join(' ')
                        .trim();
                    }

                    return {
                      id: message.id,
                      chatId: id,
                      role: message.role,
                      content: content || '',
                      createdAt: new Date(),
                    };
                  }),
                });

                // If this was invoice processing, try to save the validated data
                if (isInvoiceProcessing) {
                  try {
                    // Get the last assistant message which should contain the validation results
                    const lastMessage = sanitizedResponseMessages.find(m => m.role === 'assistant');
                    if (!lastMessage) {
                      console.error('No assistant message found in sanitized messages');
                      dataStream.write(`0:Failed to find validation results. Please try again.\n`);
                      return;
                    }

                    // Parse the structured output
                    let parsedResponse;
                    try {
                      const content = typeof lastMessage.content === 'string' 
                        ? lastMessage.content 
                        : Array.isArray(lastMessage.content)
                          ? lastMessage.content.map(part => typeof part === 'string' ? part : part.type === 'text' ? part.text : '').join(' ')
                          : '';

                      // Clean the content from markdown formatting
                      const cleanedContent = content
                        .replace(/```json\n?/g, '') // Remove ```json
                        .replace(/```\n?/g, '')     // Remove closing ```
                        .trim();                    // Remove extra whitespace
                      
                      console.log('Cleaned content for parsing:', cleanedContent);
                      parsedResponse = JSON.parse(cleanedContent);
                    } catch (error) {
                      console.error('Failed to parse structured output:', error);
                      console.error('Raw content:', lastMessage.content);
                      dataStream.write(`0:Failed to parse validation results. Please try again.\n`);
                      return;
                    }

                    // Check validation status
                    if (parsedResponse.validation.status !== 'valid') {
                      const errors = parsedResponse.validation.errors || ['Unknown validation error'];
                      console.error('Document validation failed:', errors);
                      dataStream.write(`0:Document validation failed. Issues found:\n${errors.join('\n')}\n`);
                      return;
                    }

                    // Convert the structured output to our database format
                    const invoiceData: InvoiceData = {
                      ...parsedResponse.data,
                      issueDate: new Date(parsedResponse.data.issueDate),
                      dueDate: new Date(parsedResponse.data.dueDate),
                      lineItems: parsedResponse.data.lineItems || []
                    };

                    // Save the validated invoice data
                    const savedInvoice = await saveInvoice(invoiceData);
                    console.log('Successfully saved invoice:', savedInvoice);
                    
                    // Append success message to the stream
                    dataStream.write(`0:Invoice data has been successfully validated and saved to the database.\n`);
                  } catch (error) {
                    console.error('Failed to save invoice data:', error);
                    if (error instanceof Error) {
                      console.error('Error details:', error.message);
                      console.error('Error stack:', error.stack);
                    }
                    dataStream.write(`0:Failed to save invoice data to the database. Error: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again or contact support.\n`);
                  }
                }
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
