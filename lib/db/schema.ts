import {
  sqliteTable,
  text,
  integer,
  blob,
  foreignKey,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import type { InferSelectModel } from 'drizzle-orm';

export const chat = sqliteTable('Chat', {
  id: text('id').primaryKey().notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  title: text('title').notNull(),
  visibility: text('visibility')
    .notNull()
    .default('private')
    .$type<'public' | 'private'>(),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = sqliteTable('Message', {
  id: text('id').primaryKey().notNull(),
  chatId: text('chatId')
    .notNull()
    .references(() => chat.id),
  role: text('role').notNull(),
  content: blob('content', { mode: 'json' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
});

export type Message = InferSelectModel<typeof message>;

export const vote = sqliteTable(
  'Vote',
  {
    chatId: text('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: text('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: integer('isUpvoted', { mode: 'boolean' }).notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const document = sqliteTable(
  'Document',
  {
    id: text('id').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
    title: text('title').notNull(),
    content: text('content'),
    kind: text('kind')
      .notNull()
      .default('text')
      .$type<'text' | 'code' | 'image' | 'sheet'>(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = sqliteTable(
  'Suggestion',
  {
    id: text('id').notNull(),
    documentId: text('documentId').notNull(),
    documentCreatedAt: integer('documentCreatedAt', {
      mode: 'timestamp',
    }).notNull(),
    originalText: text('originalText').notNull(),
    suggestedText: text('suggestedText').notNull(),
    description: text('description'),
    isResolved: integer('isResolved', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey(() => ({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    })),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const invoice = sqliteTable('Invoice', {
  id: text('id').primaryKey().notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  invoiceNumber: text('invoiceNumber').notNull(),
  issueDate: integer('issueDate', { mode: 'timestamp' }).notNull(),
  dueDate: integer('dueDate', { mode: 'timestamp' }).notNull(),
  totalAmount: integer('totalAmount').notNull(), // Stored in cents
  currency: text('currency').notNull().default('USD'),
  status: text('status')
    .notNull()
    .default('pending')
    .$type<'pending' | 'validated' | 'invalid' | 'processed'>(),
  
  // Customer Information
  customerName: text('customerName').notNull(),
  customerAddress: text('customerAddress'),
  customerContact: text('customerContact'),
  customerTaxId: text('customerTaxId'),
  
  // Vendor Information
  vendorName: text('vendorName').notNull(),
  vendorAddress: text('vendorAddress'),
  vendorContact: text('vendorContact'),
  vendorTaxId: text('vendorTaxId'),
  
  // Additional Fields
  paymentTerms: text('paymentTerms'),
  notes: text('notes'),
  originalFileUrl: text('originalFileUrl'),
  processingErrors: blob('processingErrors', { mode: 'json' }),
});

export type Invoice = InferSelectModel<typeof invoice>;

export const invoiceLineItem = sqliteTable('InvoiceLineItem', {
  id: text('id').primaryKey().notNull(),
  invoiceId: text('invoiceId')
    .notNull()
    .references(() => invoice.id),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: integer('unitPrice').notNull(), // Stored in cents
  totalPrice: integer('totalPrice').notNull(), // Stored in cents
  taxRate: integer('taxRate'), // Optional tax rate in basis points (e.g., 2000 = 20%)
  taxAmount: integer('taxAmount'), // Optional tax amount in cents
  sku: text('sku'), // Optional product/service identifier
  category: text('category'), // Optional categorization
});

export type InvoiceLineItem = InferSelectModel<typeof invoiceLineItem>;
