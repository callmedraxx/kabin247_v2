export interface PaymentTransaction {
  id?: number;
  order_id: number;
  square_payment_id: string;
  amount: number;
  currency?: string; // Default 'USD'
  payment_method: 'card' | 'ACH' | 'cash_app_pay' | 'afterpay' | 'other';
  card_last_4?: string;
  card_brand?: string; // Visa, Mastercard, etc.
  status: 'completed' | 'failed' | 'refunded' | 'pending';
  square_customer_id?: string;
  square_card_id?: string;
  error_message?: string;
  processed_by: number; // Admin user ID
  created_at?: Date;
  updated_at?: Date;
}

export interface StoredCard {
  id?: number;
  client_id: number;
  square_customer_id: string;
  square_card_id: string;
  card_last_4: string;
  card_brand: string;
  card_exp_month?: number;
  card_exp_year?: number;
  is_default?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreatePaymentTransactionDTO {
  order_id: number;
  square_payment_id: string;
  amount: number;
  currency?: string;
  payment_method: 'card' | 'ACH' | 'cash_app_pay' | 'afterpay' | 'other';
  card_last_4?: string;
  card_brand?: string;
  status: 'completed' | 'failed' | 'refunded' | 'pending';
  square_customer_id?: string;
  square_card_id?: string;
  error_message?: string;
  processed_by: number;
}

export interface CreateStoredCardDTO {
  client_id: number;
  square_customer_id: string;
  square_card_id: string;
  card_last_4: string;
  card_brand: string;
  card_exp_month?: number;
  card_exp_year?: number;
  is_default?: boolean;
}

export interface ProcessPaymentDTO {
  order_id: number;
  amount: number;
  payment_method: 'card' | 'ACH' | 'cash_app_pay' | 'afterpay';
  source_id: string; // Square payment source ID (from frontend)
  idempotency_key: string; // Unique key for idempotency
  use_stored_card?: boolean;
  stored_card_id?: number;
  store_card?: boolean; // Whether to store card for future use
  customer_id?: string; // Square customer ID if storing card
}

export interface ProcessPaymentResponse {
  success: boolean;
  payment_transaction?: PaymentTransaction;
  stored_card?: StoredCard;
  error?: string;
  square_error_code?: string;
}

