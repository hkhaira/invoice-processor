import 'server-only';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { invoice, invoiceLineItem, type Invoice, type InvoiceLineItem } from './schema';
import { generateUUID } from '../utils';

// Initialize database connection
const sqlite = new Database('sqlite.db');
const db = drizzle(sqlite);

export type InvoiceData = {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  totalAmount: number;
  currency?: string;
  customerName: string;
  customerAddress?: string;
  customerContact?: string;
  customerTaxId?: string;
  vendorName: string;
  vendorAddress?: string;
  vendorContact?: string;
  vendorTaxId?: string;
  paymentTerms?: string;
  notes?: string;
  originalFileUrl?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxRate?: number;
    taxAmount?: number;
    sku?: string;
    category?: string;
  }>;
};

export async function saveInvoice(data: InvoiceData): Promise<Invoice> {
  try {
    const invoiceId = generateUUID();
    
    // Convert amounts from decimal to cents
    const totalAmountCents = Math.round(data.totalAmount * 100);
    
    // Create invoice record
    const [savedInvoice] = await db.insert(invoice).values({
      id: invoiceId,
      createdAt: new Date(),
      invoiceNumber: data.invoiceNumber,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      totalAmount: totalAmountCents,
      currency: data.currency || 'USD',
      status: 'validated',
      customerName: data.customerName,
      customerAddress: data.customerAddress,
      customerContact: data.customerContact,
      customerTaxId: data.customerTaxId,
      vendorName: data.vendorName,
      vendorAddress: data.vendorAddress,
      vendorContact: data.vendorContact,
      vendorTaxId: data.vendorTaxId,
      paymentTerms: data.paymentTerms,
      notes: data.notes,
      originalFileUrl: data.originalFileUrl,
    }).returning();

    // Create line items
    if (data.lineItems?.length > 0) {
      await db.insert(invoiceLineItem).values(
        data.lineItems.map(item => ({
          id: generateUUID(),
          invoiceId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: Math.round(item.unitPrice * 100),
          totalPrice: Math.round(item.totalPrice * 100),
          taxRate: item.taxRate,
          taxAmount: item.taxAmount ? Math.round(item.taxAmount * 100) : undefined,
          sku: item.sku,
          category: item.category,
        }))
      );
    }

    return savedInvoice;
  } catch (error) {
    console.error('Failed to save invoice:', error);
    throw new Error('Failed to save invoice data');
  }
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
  try {
    const [result] = await db.select().from(invoice).where(eq(invoice.id, id));
    return result;
  } catch (error) {
    console.error('Failed to get invoice:', error);
    throw new Error('Failed to retrieve invoice data');
  }
}

export async function getInvoiceLineItems(invoiceId: string): Promise<InvoiceLineItem[]> {
  try {
    return await db.select().from(invoiceLineItem).where(eq(invoiceLineItem.invoiceId, invoiceId));
  } catch (error) {
    console.error('Failed to get invoice line items:', error);
    throw new Error('Failed to retrieve invoice line items');
  }
}

export async function updateInvoiceStatus(
  id: string, 
  status: 'pending' | 'validated' | 'invalid' | 'processed',
  errors?: any[]
): Promise<void> {
  try {
    await db.update(invoice)
      .set({ 
        status,
        processingErrors: errors ? JSON.stringify(errors) : null 
      })
      .where(eq(invoice.id, id));
  } catch (error) {
    console.error('Failed to update invoice status:', error);
    throw new Error('Failed to update invoice status');
  }
} 