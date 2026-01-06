import { PaymentTransaction, StoredCard, CreatePaymentTransactionDTO, CreateStoredCardDTO } from '../models/payment';

export interface PaymentRepository {
  createTransaction(transaction: CreatePaymentTransactionDTO): Promise<PaymentTransaction>;
  findTransactionById(id: number): Promise<PaymentTransaction | null>;
  findTransactionBySquarePaymentId(squarePaymentId: string): Promise<PaymentTransaction | null>;
  findTransactionsByOrderId(orderId: number): Promise<PaymentTransaction[]>;
  updateTransactionStatus(id: number, status: 'completed' | 'failed' | 'refunded' | 'pending', errorMessage?: string): Promise<PaymentTransaction | null>;
  
  createStoredCard(card: CreateStoredCardDTO): Promise<StoredCard>;
  findStoredCardById(id: number): Promise<StoredCard | null>;
  findStoredCardsByClientId(clientId: number): Promise<StoredCard[]>;
  findStoredCardBySquareCardId(squareCardId: string): Promise<StoredCard | null>;
  updateStoredCard(id: number, updates: Partial<CreateStoredCardDTO>): Promise<StoredCard | null>;
  deleteStoredCard(id: number): Promise<boolean>;
  setDefaultCard(clientId: number, cardId: number): Promise<void>;
}

