'use client';

import type { ChatRequestOptions, Message } from 'ai';
import cx from 'classnames';
import { motion } from 'framer-motion';
import { memo, useState } from 'react';

import type { Vote } from '@/lib/db/schema';

import { DocumentToolCall, DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon } from './icons';
import { Markdown } from './markdown';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  reload,
  isReadonly,
}: {
  chatId: string;
  message: Message;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: (
    messages: Message[] | ((messages: Message[]) => Message[]),
  ) => void;
  reload: (
    chatRequestOptions?: ChatRequestOptions,
  ) => Promise<string | null | undefined>;
  isReadonly: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  return (
    <motion.div
      className="w-full mx-auto max-w-3xl px-4 group/message"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      data-role={message.role}
    >
      <div
        className={cn(
          'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
          {
            'w-full': mode === 'edit',
            'group-data-[role=user]/message:w-fit': mode !== 'edit',
          },
        )}
      >
        {message.role === 'assistant' && (
          <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
            <div className="translate-y-px">
              <SparklesIcon size={14} />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 w-full">
          {message.experimental_attachments && (
            <div className="flex flex-row justify-end gap-2">
              {message.experimental_attachments.map((attachment) => (
                <PreviewAttachment
                  key={attachment.url}
                  attachment={attachment}
                />
              ))}
            </div>
          )}

          {message.reasoning && (
            <MessageReasoning
              isLoading={isLoading}
              reasoning={message.reasoning}
            />
          )}

          {(message.content || message.reasoning) && mode === 'view' && (
            <div className="flex flex-row gap-2 items-start">
              {message.role === 'user' && !isReadonly && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                      onClick={() => {
                        setMode('edit');
                      }}
                    >
                      <PencilEditIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit message</TooltipContent>
                </Tooltip>
              )}

              <div
                className={cn('flex flex-col gap-4', {
                  'bg-primary text-primary-foreground px-3 py-2 rounded-xl':
                    message.role === 'user',
                })}
              >
                <Markdown>{message.content as string}</Markdown>
              </div>
            </div>
          )}

          {message.content && mode === 'edit' && (
            <div className="flex flex-row gap-2 items-start">
              <div className="size-8" />

              <MessageEditor
                key={message.id}
                message={message}
                setMode={setMode}
                setMessages={setMessages}
                reload={reload}
              />
            </div>
          )}

          {message.toolInvocations && message.toolInvocations.length > 0 && (
            <div className="flex flex-col gap-4">
              {message.toolInvocations.map((toolInvocation) => {
                const { toolName, toolCallId, state, args } = toolInvocation;

                if (state === 'result') {
                  const { result } = toolInvocation;

                  return (
                    <div key={toolCallId}>
                      {toolName === 'getWeather' ? (
                        <Weather weatherAtLocation={result} />
                      ) : toolName === 'createDocument' ? (
                        <DocumentPreview
                          isReadonly={isReadonly}
                          result={result}
                        />
                      ) : toolName === 'updateDocument' ? (
                        <DocumentToolResult
                          type="update"
                          result={result}
                          isReadonly={isReadonly}
                        />
                      ) : toolName === 'requestSuggestions' ? (
                        <DocumentToolResult
                          type="request-suggestions"
                          result={result}
                          isReadonly={isReadonly}
                        />
                      ) : (
                        <pre>{JSON.stringify(result, null, 2)}</pre>
                      )}
                    </div>
                  );
                }
                return (
                  <div
                    key={toolCallId}
                    className={cx({
                      skeleton: ['getWeather'].includes(toolName),
                    })}
                  >
                    {toolName === 'getWeather' ? (
                      <Weather />
                    ) : toolName === 'createDocument' ? (
                      <DocumentPreview isReadonly={isReadonly} args={args} />
                    ) : toolName === 'updateDocument' ? (
                      <DocumentToolCall
                        type="update"
                        args={args}
                        isReadonly={isReadonly}
                      />
                    ) : toolName === 'requestSuggestions' ? (
                      <DocumentToolCall
                        type="request-suggestions"
                        args={args}
                        isReadonly={isReadonly}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {!isReadonly && (
            <MessageActions
              key={`action-${message.id}`}
              chatId={chatId}
              message={message}
              vote={vote}
              isLoading={isLoading}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.reasoning !== nextProps.message.reasoning)
      return false;
    if (prevProps.message.content !== nextProps.message.content) return false;
    if (
      !equal(
        prevProps.message.toolInvocations,
        nextProps.message.toolInvocations,
      )
    )
      return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return true;
  },
);

export function ThinkingMessage() {
  const text = "Thinking...";
  return (
    <div className="w-full mx-auto max-w-3xl px-4">
      <div className="flex gap-4">
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
          <div className="translate-y-px">
            <SparklesIcon size={14} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <motion.div 
            className="bg-muted rounded-xl px-3 py-2 w-fit"
          >
            <motion.div
              className="flex"
              initial="hidden"
              animate="visible"
              variants={{
                visible: {
                  transition: {
                    staggerChildren: 0.08,
                  },
                },
              }}
            >
              {text.split("").map((char, i) => (
                <motion.span
                  key={i}
                  variants={{
                    hidden: { 
                      opacity: 0.5
                    },
                    visible: {
                      opacity: [0.5, 1, 0.5],
                      transition: {
                        repeat: Infinity,
                        duration: 1,
                      },
                    },
                  }}
                >
                  {char}
                </motion.span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function InvoiceProcessingMessage({ status }: { status?: string }) {
  const text = status || "Processing invoice...";
  const words = text.split(" ");
  // Calculate total characters to determine full wave duration
  const totalChars = words.reduce((sum, word) => sum + word.length, 0);
  const staggerDelay = 0.08;
  // Total duration should account for all characters to get highlighted plus one full animation
  const totalDuration = (totalChars * staggerDelay) + 1;
  
  return (
    <div className="w-full mx-auto max-w-3xl px-4">
      <div className="flex gap-4">
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
          <div className="translate-y-px">
            <SparklesIcon size={14} />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <motion.div 
            className="bg-muted rounded-xl px-3 py-2 w-fit"
          >
            <motion.div
              className="flex gap-[0.3em]"
              initial="hidden"
              animate="visible"
              variants={{
                visible: {
                  transition: {
                    staggerChildren: staggerDelay,
                    repeat: Infinity,
                    duration: totalDuration,
                  },
                },
              }}
            >
              {words.map((word, wordIndex) => (
                <motion.div key={wordIndex} className="flex">
                  {word.split("").map((char, charIndex) => (
                    <motion.span
                      key={`${wordIndex}-${charIndex}`}
                      variants={{
                        hidden: { 
                          opacity: 0.5
                        },
                        visible: {
                          opacity: [0.5, 1, 0.5],
                          transition: {
                            duration: 1,
                            repeat: 0,
                          },
                        },
                      }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
