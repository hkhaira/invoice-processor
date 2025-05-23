'use client';

import type { Attachment, Message } from 'ai';
import { useChat } from 'ai/react';
import { useState, useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';

import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, generateUUID } from '@/lib/utils';

import { Block } from './block';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useBlockSelector } from '@/hooks/use-block';

export function Chat({
  id,
  initialMessages,
  selectedChatModel,
  selectedVisibilityType,
}: {
  id: string;
  initialMessages: Array<Message>;
  selectedChatModel: string;
  selectedVisibilityType: VisibilityType;
}) {
  const { mutate } = useSWRConfig();
  const [invoiceProcessingStatus, setInvoiceProcessingStatus] = useState<string | undefined>();

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    isLoading,
    stop,
    reload,
  } = useChat({
    id,
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    onFinish: () => {
      mutate('/api/history');
      setInvoiceProcessingStatus(undefined);
    },
    onError: () => {
      setInvoiceProcessingStatus(undefined);
    },
  });

  const { data: votes } = useSWR<Array<Vote>>(
    `/api/vote?chatId=${id}`,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isBlockVisible = useBlockSelector((state) => state.isVisible);

  const handleInvoiceProcessing = useCallback(async (event?: { preventDefault?: () => void }) => {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    if (!attachments.length) {
      append({
        id: generateUUID(),
        role: 'assistant',
        content: 'Please attach an invoice file first.',
      });
      return;
    }

    const invoiceFile = attachments[0];
    const contentType = invoiceFile.contentType || '';
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(contentType)) {
      append({
        id: generateUUID(),
        role: 'assistant',
        content: 'Please attach a valid invoice file (PDF, JPEG, or PNG).',
      });
      return;
    }

    setInvoiceProcessingStatus('Processing invoice...');
    
    try {
      await handleSubmit(event, {
        experimental_attachments: attachments,
      });
    } catch (error) {
      append({
        id: generateUUID(),
        role: 'assistant',
        content: 'Failed to process invoice. Please try again.',
      });
      setInvoiceProcessingStatus(undefined);
    }
  }, [attachments, handleSubmit, append]);

  const handleFormSubmit = useCallback((event?: { preventDefault?: () => void }) => {
    if (input.toLowerCase().includes('process this invoice')) {
      handleInvoiceProcessing(event);
    } else {
      handleSubmit(event);
    }
  }, [input, handleInvoiceProcessing, handleSubmit]);

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={selectedChatModel}
          selectedVisibilityType={selectedVisibilityType}
          isReadonly={false}
        />

        <Messages
          chatId={id}
          isLoading={isLoading}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          reload={reload}
          isReadonly={false}
          isBlockVisible={isBlockVisible}
          invoiceProcessingStatus={invoiceProcessingStatus}
        />

        <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
          <MultimodalInput
            chatId={id}
            input={input}
            setInput={setInput}
            handleSubmit={handleFormSubmit}
            isLoading={isLoading}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            messages={messages}
            setMessages={setMessages}
            append={append}
          />
        </form>
      </div>

      <Block
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleFormSubmit}
        isLoading={isLoading}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={false}
      />
    </>
  );
}
