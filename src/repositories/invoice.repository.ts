import { Invoice, CreateInvoiceDTO, UpdateInvoiceStatusDTO } from '../models/invoice';

export interface InvoiceRepository {
  create(invoice: CreateInvoiceDTO): Promise<Invoice>;
  findById(id: number): Promise<Invoice | null>;
  findBySquareInvoiceId(squareInvoiceId: string): Promise<Invoice | null>;
  findByOrderId(orderId: number): Promise<Invoice[]>;
  findByReferenceId(referenceId: string): Promise<Invoice | null>;
  updateStatus(id: number, statusUpdate: UpdateInvoiceStatusDTO): Promise<Invoice | null>;
  updatePublicUrl(id: number, publicUrl: string): Promise<Invoice | null>;
  updateEmailSent(id: number, emailSentAt: Date): Promise<Invoice | null>;
  delete(id: number): Promise<boolean>;
}

