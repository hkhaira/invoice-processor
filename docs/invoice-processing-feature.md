# Product Requirements Document (PRD) - invoice processing feature

## 1. Overview

**Project Title:**  
Invoice Processing & Management Feature

**Objective:**  
Build a conversational interface that allows company admins to upload vendor invoices (PDFs or images) and automatically extract, validate, and manage key invoice information using an AI agent.

**Scope:**  
Develop an MVP that supports single file uploads, real-time processing with a 30-second timeout while leveraging the existing codebase and authentication framework.

---

## 2. Goals and Success Metrics

### Goals
- **Invoice Upload & Processing:**  
  - Enable single file upload (PDF/image) using the existing upload APIs.
  - Process the invoice synchronously using AI for data extraction with real-time progress feedback. Make this behavior Agentic, i.e. we would want to send the uploaded PDFs and images directly to the LLM along with user prompt "Process this invoice" for extraction of key information from invoice that needs to be stored in the sqlite database locally.
  - Enforce invoice validation criteria and provide actionable feedback on rejections. Make this behavior Agentic, i.e. we would want to send the validating criteria to LLM along with uploaded file and user prompt, LLM should check and judge if user uploaded a valid invoice file. We want to prevent admins from uploading documents that are not invoices, such as receipts and account statements. 


- **Data Management:**  
  - Save AI-extracted data in a SQLite database. This includes Customer name, Vendor name, Invoice number, Invoice date, Due date, Amount, Line items
  - Allow admins to review and edit extracted data via a conversational UI and a sortable table interface.

- **Security & Compliance:**  
  - Implement simple invoice data deletion functionality.

### Success Metrics
- **User Experience:**  
  - Real-time processing feedback.
  - Clear, user-friendly error messages and validations.
- **Data Accuracy:**  
  - AI extraction meets defined invoice criteria with minimal manual corrections.
- **System Reliability:**  
  - Synchronous processing within 30 seconds

---

## 3. Features & Requirements

### 3.1. Invoice Upload & Processing

- **File Upload:**
  - **Requirement:**  
    - Support single file upload (PDFs and images) using the existing file upload API.
  - **Notes:**  
    - Batch upload is deferred to a future phase.

- **Real-Time Processing:**
  - **Requirement:**  
    - Process the invoice synchronously using Vercel AI SDK's streaming capabilities.
    - Implement a 30-second timeout; if exceeded, notify the user and continue processing in the background.
  - **Feedback:**  
    - Provide immediate status updates and progress indicators.

- **AI Extraction & Validation:**
  - **Fields to Extract:**  
    - Customer name  
    - Vendor name  
    - Invoice number  
    - Invoice date  
    - Due date  
    - Amount  
    - Line items
  - **Validation Criteria:**  
    - Must have an invoice number.
    - Must include an issue date and due date/payment terms.
    - Must include vendor and customer information.
    - Must list itemized charges/services.
    - Must show a total amount due.
  - **Rejection Feedback:**  
    - Clearly notify the admin if the document is not a valid invoice (e.g., "This appears to be a receipt rather than an invoice"). In such a case do not save any extracted data to SQLite, only store extracted invoice data after validating with using the LLM that user has uploaded a valid invoice

### 3.2. Data Management & Storage

- **Database:**
  - **Requirement:**  
    - Use SQLite with Drizzle ORM to store extracted invoice data.
    - Extend the existing invoice document model to also store original binary data.

- **GDPR Compliance:**
  - **Requirement:**  
    - Implement a basic deletion mechanism to remove invoice data from primary tables on request.

### 3.3. Admin Interface & Interaction

- **Conversational UI:**
  - **Requirement:**  
    - Use the existing chat interface where admins can type commands such as "Process this invoice" to initiate processing.
    - Display real-time updates and status messages during processing.

- **Error Messaging:**
  - **Requirement:**  
    - Provide clear and actionable error messages for:
      - File format issues.
      - Extraction failures.
      - Database or API errors.
  - **Style:**  
    - Use the existing UI design patterns, without complex error codes or help documentation links for the MVP.

---

## 4. Technical Architecture

### Frontend
- **Technologies:**  
  - Next.js (App Router), React, TypeScript.
  - UI Libraries: Shadcn/ui, Tailwind CSS.
- **Components:**  
  - **File Upload Component:**  
    - Supports drag-and-drop, single file validation.
  - **Conversational Chat Interface:**  
    - For command input and real-time processing feedback.
  - **Invoice Management Table:**  
    - Sortable, editable table for invoice records.

### Backend
- **Technologies:**  
  - Next.js API routes (or app route handlers).
  - SQLite with Drizzle ORM for data persistence.
- **File Processing:**
  - **PDF and Image Processing:**  
    - Leverage OpenAI GPT-4o's native multi-modal capabilities through Vercel AI SDK.
    - GPT-4o can natively process both PDF documents and images without requiring external libraries.
- **AI Integration:**
  - Leverage Vercel AI SDK 4.0+ with OpenAI GPT-4o for invoice data extraction. https://sdk.vercel.ai/docs v4.1
  - Pass PDFs and images directly to GPT-4o using the AI SDK's file support.
  - Implement a timeout mechanism with a fallback for long processing tasks.


---

## 5. Implementation Roadmap

### A. Setup & Environment Preparation
1. **Repository Initialization:**  
   - Clone the starter code from Bitbucket.
   - Set up the development environment with Next.js, SQLite, and necessary dependencies.
2. **Database Schema Updates:**  
   - Extend the document model with invoice-specific fields.

### B. Frontend Development
1. **Invoice Upload & Chat Interface:**  
   - Build on existing chat interface and single file upload component.
   - Develop the conversational UI for initiating and tracking processing.
3. **Error Messaging UI:**  
   - Integrate consistent, user-friendly error messages.

### C. Backend Development
1. **File Processing & AI Extraction:**  
   - Implement direct file passing to GPT-4o using Vercel AI SDK.
   - Set a 30-second synchronous processing timeout with a fallback.
2. **Validation & Data Persistence:**  
   - Enforce invoice validation rules.
   - Save original file data and AI extracted data with key information in SQLite.

### D. Testing & Quality Assurance
1. **Unit Testing:**  
   - Test individual components.
2. **Integration Testing:**  
   - Validate end-to-end processing of invoice uploads and data extraction.
3. **User Acceptance Testing:**  
   - Ensure admins can interact with the interface and receive proper feedback.

### E. Deployment & Documentation
1. **Deployment:**  
   - Deploy the MVP in a development environment.
2. **Documentation:**  
   - Update project documentation with database schema changes, and user instructions.

---

## 6. Dependencies & Assumptions

- **Technologies:**  
  - Next.js, React, TypeScript, Tailwind CSS, Shadcn/ui, SQLite, Drizzle ORM.
- **AI Integration:**  
  - Vercel AI SDK 4.0+ with OpenAI GPT-4o. https://sdk.vercel.ai/docs v4.1
  - GPT-4o supports native PDF and image processing without external libraries.
- **Assumptions:**  
  - The current file upload API supports only single file uploads.
  - Existing authentication and messaging systems will be used as-is.

---

## 8. Timeline

- **Development:**  
  Estimated 4-8 hours of work (with a cap of 2-3 days maximum).
- **Testing & QA:**  
  Unit, integration, and user acceptance testing to be performed during the development phase.
- **Deployment:**  
  Roll out MVP to a development environment.

---