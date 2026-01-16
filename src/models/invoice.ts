export interface Invoice {
  id?: number;
  order_id: number;
  square_invoice_id: string;
  public_url?: string;
  reference_id: string;
  status: 'pending' | 'paid' | 'cancelled' | 'failed';
  amount: number;
  currency: string;
  delivery_method: 'EMAIL' | 'SHARE_MANUALLY';
  recipient_email?: string;
  email_sent_at?: Date;
  created_by: number;
  created_at?: Date;
  updated_at?: Date;
  paid_at?: Date;
}

export interface InvoiceLineItem {
  name: string;
  quantity: string;
  unit_price: number;
  description?: string;
}

export interface CreateInvoiceDTO {
  order_id: number;
  square_invoice_id: string;
  public_url?: string;
  reference_id: string;
  status: 'pending' | 'paid' | 'cancelled' | 'failed';
  amount: number;
  currency?: string;
  delivery_method: 'EMAIL' | 'SHARE_MANUALLY';
  recipient_email?: string;
  email_sent_at?: Date;
  created_by: number;
  paid_at?: Date;
}

export interface SendInvoiceRequest {
  delivery_method: 'EMAIL' | 'SHARE_MANUALLY';
  recipient_email?: string;
  additional_emails?: string[];
}

export interface UpdateInvoiceStatusDTO {
  status: 'pending' | 'paid' | 'cancelled' | 'failed';
  paid_at?: Date;
}

