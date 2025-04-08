# HOAi Take-Home Assignment: AI-Powered Invoice Processing System

## Implementation Approach

This project was developed as part of a take-home interview assignment for HOAi, focusing on building an AI-powered invoice processing system. Here's my systematic approach to implementation:

### 1. Planning and Documentation
- Collaborated with AI to iteratively develop a granular, step-by-step implementation plan
- Created comprehensive PRD documents breaking down features and requirements:
  - [Invoice Processing Feature](docs/invoice-processing-feature.md)
  - [Invoice Processing Todo List](docs/invoice-processing-feature-todo.md)
  - [Invoice Table Feature](docs/invoice-table-feature.md)

### 2. AI-Driven Development Strategy
Successfully leveraged Claude 3.5 Sonnet through Cursor IDE by:
- Breaking down complex features into manageable tasks
- Using test-driven development (TDD) approach
- Iterating on solutions while maintaining code quality
- Ensuring proper error handling and edge cases
- Following best practices for each technology in the stack

### 3. Key Features Implemented
- Conversational interface for invoice upload and processing
- AI-powered information extraction (customer details, amounts, dates)
- Invoice validation and duplicate detection
- Interactive invoice management table
- Token usage tracking and optimization

## Technical Stack

## Features

- [Next.js](https://nextjs.org) App Router
  - Advanced routing for seamless navigation and performance
  - React Server Components (RSCs) and Server Actions for server-side rendering and increased performance
- [AI SDK](https://sdk.vercel.ai/docs)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
  - Supports OpenAI (default), Anthropic, Cohere, and other model providers
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility

## Model Providers

This template ships with OpenAI `gpt-4o` as the default. However, with the [AI SDK](https://sdk.vercel.ai/docs), you can switch LLM providers to [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), [Cohere](https://cohere.com/), and [many more](https://sdk.vercel.ai/providers/ai-sdk-providers) with just a few lines of code.


## Running locally

You will need to use the environment variables [defined in `.env.example`](.env.example) to run Next.js AI Chatbot. 

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Your app template should now be running on [localhost:3000](http://localhost:3000/).
