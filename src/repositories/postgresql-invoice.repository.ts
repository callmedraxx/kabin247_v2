import { DatabaseAdapter } from '../database/adapter';
import { Invoice, CreateInvoiceDTO, UpdateInvoiceStatusDTO } from '../models/invoice';
import { InvoiceRepository } from './invoice.repository';

export class PostgreSQLInvoiceRepository implements InvoiceRepository {
  constructor(private db: DatabaseAdapter) {}

  private mapRowToInvoice(row: any): Invoice {
    return {
      id: row.id,
      order_id: row.order_id,
      square_invoice_id: row.square_invoice_id,
      public_url: row.public_url,
      reference_id: row.reference_id,
      status: row.status,
      amount: parseFloat(row.amount),
      currency: row.currency,
      delivery_method: row.delivery_method,
      recipient_email: row.recipient_email,
      email_sent_at: row.email_sent_at ? new Date(row.email_sent_at) : undefined,
      created_by: row.created_by,
      created_at: row.created_at ? new Date(row.created_at) : undefined,
      updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
      paid_at: row.paid_at ? new Date(row.paid_at) : undefined,
    };
  }

  async create(invoice: CreateInvoiceDTO): Promise<Invoice> {
    const query = `
      INSERT INTO invoices (
        order_id, square_invoice_id, public_url, reference_id, status,
        amount, currency, delivery_method, recipient_email, email_sent_at,
        created_by, created_at, updated_at, paid_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW(), $12)
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      invoice.order_id,
      invoice.square_invoice_id,
      invoice.public_url || null,
      invoice.reference_id,
      invoice.status,
      invoice.amount,
      invoice.currency || 'USD',
      invoice.delivery_method,
      invoice.recipient_email || null,
      invoice.email_sent_at || null,
      invoice.created_by,
      invoice.paid_at || null,
    ]);
    
    return this.mapRowToInvoice(result.rows[0]);
  }

  async findById(id: number): Promise<Invoice | null> {
    const query = 'SELECT * FROM invoices WHERE id = $1';
    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToInvoice(result.rows[0]);
  }

  async findBySquareInvoiceId(squareInvoiceId: string): Promise<Invoice | null> {
    const query = 'SELECT * FROM invoices WHERE square_invoice_id = $1';
    const result = await this.db.query(query, [squareInvoiceId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToInvoice(result.rows[0]);
  }

  async findByOrderId(orderId: number): Promise<Invoice[]> {
    const query = 'SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC';
    const result = await this.db.query(query, [orderId]);
    
    return result.rows.map((row: any) => this.mapRowToInvoice(row));
  }

  async findByReferenceId(referenceId: string): Promise<Invoice | null> {
    const query = 'SELECT * FROM invoices WHERE reference_id = $1 ORDER BY created_at DESC LIMIT 1';
    const result = await this.db.query(query, [referenceId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToInvoice(result.rows[0]);
  }

  async updateStatus(id: number, statusUpdate: UpdateInvoiceStatusDTO): Promise<Invoice | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    updates.push(`status = $${paramCount++}`);
    values.push(statusUpdate.status);

    if (statusUpdate.paid_at !== undefined) {
      updates.push(`paid_at = $${paramCount++}`);
      values.push(statusUpdate.paid_at);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE invoices
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;
    
    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToInvoice(result.rows[0]);
  }

  async updatePublicUrl(id: number, publicUrl: string): Promise<Invoice | null> {
    const query = `
      UPDATE invoices
      SET public_url = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await this.db.query(query, [publicUrl, id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToInvoice(result.rows[0]);
  }

  async updateEmailSent(id: number, emailSentAt: Date): Promise<Invoice | null> {
    const query = `
      UPDATE invoices
      SET email_sent_at = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await this.db.query(query, [emailSentAt, id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToInvoice(result.rows[0]);
  }

  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM invoices WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return (result.rowCount || 0) > 0;
  }
}

