import { SquareClient, SquareEnvironment } from 'square';
import { v4 as uuidv4 } from 'uuid';
import { getPaymentRepository, getOrderRepository } from '../repositories';
import { PaymentTransaction, StoredCard, ProcessPaymentDTO, ProcessPaymentResponse, CreatePaymentTransactionDTO, CreateStoredCardDTO } from '../models/payment';
import { Logger } from '../utils/logger';

export class PaymentService {
  private paymentRepository = getPaymentRepository();
  private orderRepository = getOrderRepository();
  private squareClient: SquareClient;

  constructor() {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const environment = process.env.SQUARE_ENVIRONMENT === 'production' 
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox;

    if (!accessToken) {
      Logger.warn('Square access token not configured. Payment processing will not work.');
      throw new Error('Square access token is required');
    }

    Logger.info('Initializing Square client', {
      hasToken: !!accessToken,
      tokenPrefix: accessToken ? accessToken.substring(0, 10) + '...' : 'none',
      environment: environment === SquareEnvironment.Production ? 'production' : 'sandbox',
    });

    /**
     * Square SDK Initialization (v40.0.0+)
     * 
     * IMPORTANT: SDK v40.0.0+ uses 'token' parameter, not 'accessToken'
     * This was a breaking change from earlier SDK versions.
     */
    this.squareClient = new SquareClient({
      token: accessToken,  // Use 'token' for SDK v40.0.0+
      environment: environment,
    });
    
    // Verify the client was created correctly
    Logger.info('Square client initialized', {
      hasClient: !!this.squareClient,
      hasPayments: !!this.squareClient.payments,
      clientType: this.squareClient.constructor.name,
    });
  }

  /**
   * Process a payment using Square
   */
  async processPayment(
    paymentData: ProcessPaymentDTO,
    adminUserId: number
  ): Promise<ProcessPaymentResponse> {
    try {
      const order = await this.orderRepository.findById(paymentData.order_id);
      if (!order) {
        return {
          success: false,
          error: 'Order not found',
        };
      }

      // Check if order is already paid
      const existingTransactions = await this.paymentRepository.findTransactionsByOrderId(paymentData.order_id);
      const hasCompletedPayment = existingTransactions.some(t => t.status === 'completed');
      
      if (hasCompletedPayment) {
        return {
          success: false,
          error: 'Order has already been paid',
        };
      }

      const locationId = process.env.SQUARE_LOCATION_ID;
      if (!locationId) {
        return {
          success: false,
          error: 'Square location ID not configured',
        };
      }

      // Create payment request
      const paymentsApi = this.squareClient.payments;
      
      const paymentRequest: any = {
        sourceId: paymentData.source_id,
        idempotencyKey: paymentData.idempotency_key,
        amountMoney: {
          amount: BigInt(Math.round(paymentData.amount * 100)), // Convert to cents
          currency: 'USD',
        },
        locationId: locationId, // Square requires location ID for payments
        note: `Payment for order ${order.order_number}`,
      };

      // Process payment
      Logger.info('Processing Square payment', {
        orderId: paymentData.order_id,
        amount: paymentData.amount,
        locationId: locationId,
        hasSourceId: !!paymentData.source_id,
      });
      
      const response: any = await paymentsApi.create(paymentRequest);
      
      Logger.info('Square payment response', {
        hasBody: !!response.body,
        hasResult: !!response.result,
        hasPayment: !!response.payment,
        status: response.statusCode || response.status,
        responseKeys: Object.keys(response),
      });
      
      // SDK v40+ returns data directly on response object, not nested in body/result
      const squarePayment = response.payment || response.body?.payment || response.result?.payment;
      
      if (squarePayment) {
        const paymentStatus = squarePayment.status === 'COMPLETED' ? 'completed' : 
                             squarePayment.status === 'FAILED' ? 'failed' : 'pending';
        
        // Extract card information if available
        const cardDetails = squarePayment.cardDetails;
        const cardLast4 = cardDetails?.card?.last4;
        const cardBrand = cardDetails?.card?.cardBrand;

        // Create payment transaction record
        const transactionData: CreatePaymentTransactionDTO = {
          order_id: paymentData.order_id,
          square_payment_id: squarePayment.id || '',
          amount: paymentData.amount,
          currency: 'USD',
          payment_method: paymentData.payment_method,
          card_last_4: cardLast4,
          card_brand: cardBrand,
          status: paymentStatus,
          square_customer_id: paymentData.customer_id || squarePayment.customerId,
          square_card_id: squarePayment.cardDetails?.card?.id,
          error_message: paymentStatus === 'failed' ? squarePayment.receiptNumber : undefined,
          processed_by: adminUserId,
        };

        const transaction = await this.paymentRepository.createTransaction(transactionData);

        // If payment is completed, update order status to 'paid'
        if (paymentStatus === 'completed') {
          await this.orderRepository.updateStatus(paymentData.order_id, 'paid');
        }

        // Handle card storage if requested
        let storedCard: StoredCard | undefined;
        if (paymentData.store_card && paymentData.customer_id && squarePayment.cardDetails?.card?.id) {
          storedCard = await this.storeCardFromPayment(
            order.client_id || 0,
            paymentData.customer_id,
            squarePayment.cardDetails.card.id,
            cardLast4 || '',
            cardBrand || 'Unknown',
            paymentData.use_stored_card || false
          );
        }

        return {
          success: paymentStatus === 'completed',
          payment_transaction: transaction,
          stored_card: storedCard,
          error: paymentStatus === 'failed' ? 'Payment failed' : undefined,
        };
      } else {
        // Payment failed - SDK v40+ may return errors directly or nested
        const errors = response.errors || response.body?.errors || response.result?.errors || [];
        const errorMessage = errors[0]?.detail || 'Payment processing failed';
        const errorCode = errors[0]?.code || 'UNKNOWN';
        
        Logger.error('Square payment failed', {
          errors: errors,
          errorCode: errorCode,
          statusCode: response.statusCode || response.status,
          orderId: paymentData.order_id,
        });
        
        const transactionData: CreatePaymentTransactionDTO = {
          order_id: paymentData.order_id,
          square_payment_id: `failed_${uuidv4()}`,
          amount: paymentData.amount,
          currency: 'USD',
          payment_method: paymentData.payment_method,
          status: 'failed',
          error_message: errorMessage,
          processed_by: adminUserId,
        };

        await this.paymentRepository.createTransaction(transactionData);

        return {
          success: false,
          error: errorMessage,
          square_error_code: errors[0]?.code,
        };
      }
    } catch (error: any) {
      Logger.error('Payment processing error', error, {
        orderId: paymentData.order_id,
        amount: paymentData.amount,
      });

      // Create failed transaction record
      try {
        const transactionData: CreatePaymentTransactionDTO = {
          order_id: paymentData.order_id,
          square_payment_id: `error_${uuidv4()}`,
          amount: paymentData.amount,
          currency: 'USD',
          payment_method: paymentData.payment_method,
          status: 'failed',
          error_message: error.message || 'Payment processing error',
          processed_by: adminUserId,
        };

        await this.paymentRepository.createTransaction(transactionData);
      } catch (dbError) {
        Logger.error('Failed to create failed transaction record', dbError);
      }

      return {
        success: false,
        error: error.message || 'Payment processing failed',
      };
    }
  }

  /**
   * Store a card for future use
   */
  async storeCardFromPayment(
    clientId: number,
    squareCustomerId: string,
    squareCardId: string,
    cardLast4: string,
    cardBrand: string,
    isDefault: boolean = false
  ): Promise<StoredCard> {
    // Check if card already exists
    const existingCard = await this.paymentRepository.findStoredCardBySquareCardId(squareCardId);
    if (existingCard) {
      return existingCard;
    }

    const cardData: CreateStoredCardDTO = {
      client_id: clientId,
      square_customer_id: squareCustomerId,
      square_card_id: squareCardId,
      card_last_4: cardLast4,
      card_brand: cardBrand,
      is_default: isDefault,
    };

    return await this.paymentRepository.createStoredCard(cardData);
  }

  /**
   * Get stored cards for a client
   */
  async getStoredCards(clientId: number): Promise<StoredCard[]> {
    return await this.paymentRepository.findStoredCardsByClientId(clientId);
  }

  /**
   * Delete a stored card
   */
  async deleteStoredCard(cardId: number): Promise<boolean> {
    return await this.paymentRepository.deleteStoredCard(cardId);
  }

  /**
   * Get payment transactions for an order
   */
  async getOrderPayments(orderId: number): Promise<PaymentTransaction[]> {
    return await this.paymentRepository.findTransactionsByOrderId(orderId);
  }

  /**
   * Get a payment transaction by ID
   */
  async getPaymentTransaction(transactionId: number): Promise<PaymentTransaction | null> {
    return await this.paymentRepository.findTransactionById(transactionId);
  }

  /**
   * Create a Square customer (for storing cards)
   */
  async createSquareCustomer(
    clientId: number,
    email?: string,
    phoneNumber?: string
  ): Promise<string | null> {
    try {
      const customersApi = this.squareClient.customers;
      
      const requestBody = {
        givenName: 'Client',
        familyName: `#${clientId}`,
        emailAddress: email,
        phoneNumber: phoneNumber,
        note: `Client ID: ${clientId}`,
      };

      const response: any = await customersApi.create(requestBody);
      
      if (response.body?.customer || response.result?.customer) {
        const customer = response.body?.customer || response.result?.customer;
        return customer.id || null;
      }

      return null;
    } catch (error: any) {
      Logger.error('Failed to create Square customer', error, { clientId });
      return null;
    }
  }
}

let paymentServiceInstance: PaymentService | null = null;

export function getPaymentService(): PaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new PaymentService();
  }
  return paymentServiceInstance;
}

