import { DatabaseAdapter } from '../database/adapter';
import { PaymentTransaction, StoredCard, CreatePaymentTransactionDTO, CreateStoredCardDTO } from '../models/payment';
import { PaymentRepository } from './payment.repository';

export class PostgreSQLPaymentRepository implements PaymentRepository {
  constructor(private db: DatabaseAdapter) {}

  async createTransaction(transaction: CreatePaymentTransactionDTO): Promise<PaymentTransaction> {
    const query = `
      INSERT INTO payment_transactions (
        order_id, square_payment_id, amount, currency, payment_method,
        card_last_4, card_brand, status, square_customer_id, square_card_id,
        error_message, processed_by, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      transaction.order_id,
      transaction.square_payment_id,
      transaction.amount,
      transaction.currency || 'USD',
      transaction.payment_method,
      transaction.card_last_4 || null,
      transaction.card_brand || null,
      transaction.status,
      transaction.square_customer_id || null,
      transaction.square_card_id || null,
      transaction.error_message || null,
      transaction.processed_by,
    ]);
    
    return this.mapRowToTransaction(result.rows[0]);
  }

  async findTransactionById(id: number): Promise<PaymentTransaction | null> {
    const query = 'SELECT * FROM payment_transactions WHERE id = $1';
    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToTransaction(result.rows[0]);
  }

  async findTransactionBySquarePaymentId(squarePaymentId: string): Promise<PaymentTransaction | null> {
    const query = 'SELECT * FROM payment_transactions WHERE square_payment_id = $1';
    const result = await this.db.query(query, [squarePaymentId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToTransaction(result.rows[0]);
  }

  async findTransactionsByOrderId(orderId: number): Promise<PaymentTransaction[]> {
    const query = 'SELECT * FROM payment_transactions WHERE order_id = $1 ORDER BY created_at DESC';
    const result = await this.db.query(query, [orderId]);
    
    return result.rows.map((row: any) => this.mapRowToTransaction(row));
  }

  async updateTransactionStatus(
    id: number,
    status: 'completed' | 'failed' | 'refunded' | 'pending',
    errorMessage?: string
  ): Promise<PaymentTransaction | null> {
    const query = `
      UPDATE payment_transactions
      SET status = $1, error_message = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await this.db.query(query, [status, errorMessage || null, id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToTransaction(result.rows[0]);
  }

  async createStoredCard(card: CreateStoredCardDTO): Promise<StoredCard> {
    // If this is set as default, unset other default cards for this client
    if (card.is_default) {
      await this.db.query(
        'UPDATE stored_cards SET is_default = false WHERE client_id = $1',
        [card.client_id]
      );
    }
    
    const query = `
      INSERT INTO stored_cards (
        client_id, square_customer_id, square_card_id, card_last_4,
        card_brand, card_exp_month, card_exp_year, is_default, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await this.db.query(query, [
      card.client_id,
      card.square_customer_id,
      card.square_card_id,
      card.card_last_4,
      card.card_brand,
      card.card_exp_month || null,
      card.card_exp_year || null,
      card.is_default || false,
    ]);
    
    return this.mapRowToStoredCard(result.rows[0]);
  }

  async findStoredCardById(id: number): Promise<StoredCard | null> {
    const query = 'SELECT * FROM stored_cards WHERE id = $1';
    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToStoredCard(result.rows[0]);
  }

  async findStoredCardsByClientId(clientId: number): Promise<StoredCard[]> {
    const query = 'SELECT * FROM stored_cards WHERE client_id = $1 ORDER BY is_default DESC, created_at DESC';
    const result = await this.db.query(query, [clientId]);
    
    return result.rows.map((row: any) => this.mapRowToStoredCard(row));
  }

  async findStoredCardBySquareCardId(squareCardId: string): Promise<StoredCard | null> {
    const query = 'SELECT * FROM stored_cards WHERE square_card_id = $1';
    const result = await this.db.query(query, [squareCardId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToStoredCard(result.rows[0]);
  }

  async updateStoredCard(id: number, updates: Partial<CreateStoredCardDTO>): Promise<StoredCard | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (updates.is_default !== undefined) {
      fields.push(`is_default = $${paramIndex++}`);
      values.push(updates.is_default);
    }
    
    if (updates.card_exp_month !== undefined) {
      fields.push(`card_exp_month = $${paramIndex++}`);
      values.push(updates.card_exp_month);
    }
    
    if (updates.card_exp_year !== undefined) {
      fields.push(`card_exp_year = $${paramIndex++}`);
      values.push(updates.card_exp_year);
    }
    
    if (fields.length === 0) {
      return this.findStoredCardById(id);
    }
    
    fields.push(`updated_at = NOW()`);
    values.push(id);
    
    const query = `
      UPDATE stored_cards
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    
    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return this.mapRowToStoredCard(result.rows[0]);
  }

  async deleteStoredCard(id: number): Promise<boolean> {
    const query = 'DELETE FROM stored_cards WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async setDefaultCard(clientId: number, cardId: number): Promise<void> {
    // First, unset all default cards for this client
    await this.db.query(
      'UPDATE stored_cards SET is_default = false WHERE client_id = $1',
      [clientId]
    );
    
    // Then set the specified card as default
    await this.db.query(
      'UPDATE stored_cards SET is_default = true, updated_at = NOW() WHERE id = $1 AND client_id = $2',
      [cardId, clientId]
    );
  }

  private mapRowToTransaction(row: any): PaymentTransaction {
    return {
      id: row.id,
      order_id: row.order_id,
      square_payment_id: row.square_payment_id,
      amount: parseFloat(row.amount),
      currency: row.currency,
      payment_method: row.payment_method,
      card_last_4: row.card_last_4,
      card_brand: row.card_brand,
      status: row.status,
      square_customer_id: row.square_customer_id,
      square_card_id: row.square_card_id,
      error_message: row.error_message,
      processed_by: row.processed_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private mapRowToStoredCard(row: any): StoredCard {
    return {
      id: row.id,
      client_id: row.client_id,
      square_customer_id: row.square_customer_id,
      square_card_id: row.square_card_id,
      card_last_4: row.card_last_4,
      card_brand: row.card_brand,
      card_exp_month: row.card_exp_month,
      card_exp_year: row.card_exp_year,
      is_default: row.is_default,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

