CREATE TABLE `Invoice` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` integer NOT NULL,
	`invoiceNumber` text NOT NULL,
	`issueDate` integer NOT NULL,
	`dueDate` integer NOT NULL,
	`totalAmount` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`customerName` text NOT NULL,
	`customerAddress` text,
	`customerContact` text,
	`customerTaxId` text,
	`vendorName` text NOT NULL,
	`vendorAddress` text,
	`vendorContact` text,
	`vendorTaxId` text,
	`paymentTerms` text,
	`notes` text,
	`originalFileUrl` text,
	`processingErrors` blob
);
--> statement-breakpoint
CREATE TABLE `InvoiceLineItem` (
	`id` text PRIMARY KEY NOT NULL,
	`invoiceId` text NOT NULL,
	`description` text NOT NULL,
	`quantity` integer NOT NULL,
	`unitPrice` integer NOT NULL,
	`totalPrice` integer NOT NULL,
	`taxRate` integer,
	`taxAmount` integer,
	`sku` text,
	`category` text,
	FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON UPDATE no action ON DELETE no action
);
