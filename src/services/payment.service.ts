import { SquareClient, SquareEnvironment } from 'square';
import { v4 as uuidv4 } from 'uuid';
import { getPaymentRepository, getOrderRepository, getInvoiceRepository, getClientRepository } from '../repositories';
import { PaymentTransaction, StoredCard, ProcessPaymentDTO, ProcessPaymentResponse, CreatePaymentTransactionDTO, CreateStoredCardDTO } from '../models/payment';
import { Logger } from '../utils/logger';

export class PaymentService {
  private paymentRepository = getPaymentRepository();
  private orderRepository = getOrderRepository();
  private invoiceRepository = getInvoiceRepository();
  private clientRepository = getClientRepository();
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
    Logger.info('=== PAYMENT PROCESSING START ===', {
      orderId: paymentData.order_id,
      amount: paymentData.amount,
      paymentMethod: paymentData.payment_method,
      hasSourceId: !!paymentData.source_id,
      providedCustomerId: paymentData.customer_id || 'none',
      adminUserId,
      timestamp: new Date().toISOString(),
    });

    try {
      const order = await this.orderRepository.findById(paymentData.order_id);
      if (!order) {
        Logger.error('Payment processing failed: Order not found', {
          orderId: paymentData.order_id,
        });
        return {
          success: false,
          error: 'Order not found',
        };
      }

      Logger.info('Order retrieved for payment', {
        orderId: order.id,
        orderNumber: order.order_number,
        clientId: order.client?.id || 'none',
        clientName: order.client?.full_name || order.client?.company_name || order.client_name || 'none',
        clientEmail: order.client?.email || 'none',
        orderStatus: order.status,
        orderTotal: order.total,
      });

      // Check if order is already paid
      const existingTransactions = await this.paymentRepository.findTransactionsByOrderId(paymentData.order_id);
      const hasCompletedPayment = existingTransactions.some(t => t.status === 'completed');
      
      Logger.info('Checking existing transactions', {
        orderId: paymentData.order_id,
        existingTransactionCount: existingTransactions.length,
        hasCompletedPayment,
        transactionStatuses: existingTransactions.map(t => t.status),
      });

      if (hasCompletedPayment) {
        Logger.warn('Payment processing blocked: Order already paid', {
          orderId: paymentData.order_id,
          existingTransactions: existingTransactions.map(t => ({
            id: t.id,
            status: t.status,
            amount: t.amount,
            squarePaymentId: t.square_payment_id,
            squareCustomerId: t.square_customer_id,
          })),
        });
        return {
          success: false,
          error: 'Order has already been paid',
        };
      }

      const locationId = process.env.SQUARE_LOCATION_ID;
      if (!locationId) {
        Logger.error('Payment processing failed: Square location ID not configured');
        return {
          success: false,
          error: 'Square location ID not configured',
        };
      }

      Logger.info('Finding or creating Square customer for payment', {
        orderId: paymentData.order_id,
        clientId: order.client?.id || 'none',
        clientEmail: order.client?.email || 'none',
        clientName: order.client?.full_name || order.client?.company_name || order.client_name || 'none',
        clientContactNumber: order.client?.contact_number || 'none',
        providedCustomerId: paymentData.customer_id || 'none',
      });

      // Find or create the correct Square customer based on the order's client
      // This ensures payments are associated with the correct customer in Square
      const correctCustomerId = await this.findOrCreateSquareCustomer(
        order.client?.id,
        order.client?.email,
        order.client?.full_name || order.client?.company_name || order.client_name,
        order.client?.contact_number
      );

      if (!correctCustomerId) {
        Logger.warn('Could not find or create Square customer for payment, proceeding without customer ID', {
          orderId: paymentData.order_id,
          clientId: order.client?.id,
          clientEmail: order.client?.email,
          clientName: order.client?.full_name || order.client?.company_name || order.client_name,
          providedCustomerId: paymentData.customer_id || 'none',
        });
      } else {
        Logger.info('✓ Square customer determined for payment', {
          orderId: paymentData.order_id,
          clientId: order.client?.id || 'none',
          squareCustomerId: correctCustomerId,
          clientName: order.client?.full_name || order.client?.company_name || order.client_name || 'none',
          clientEmail: order.client?.email || 'none',
          providedCustomerId: paymentData.customer_id || 'none',
          usingProvidedCustomerId: correctCustomerId === paymentData.customer_id,
        });
      }

      // Create payment request
      const paymentsApi = this.squareClient.payments;
      
      const finalCustomerId = correctCustomerId || paymentData.customer_id;
      const amountInCents = BigInt(Math.round(paymentData.amount * 100));
      
      const paymentRequest: any = {
        sourceId: paymentData.source_id,
        idempotencyKey: paymentData.idempotency_key,
        amountMoney: {
          amount: amountInCents,
          currency: 'USD',
        },
        locationId: locationId,
        note: `Payment for order ${order.order_number}`,
        customerId: finalCustomerId,
      };

      Logger.info('Creating Square payment request', {
        orderId: paymentData.order_id,
        orderNumber: order.order_number,
        amount: paymentData.amount,
        amountInCents: amountInCents.toString(),
        locationId: locationId,
        sourceId: paymentData.source_id,
        idempotencyKey: paymentData.idempotency_key,
        customerId: finalCustomerId || 'none',
        customerIdSource: correctCustomerId ? 'found/created' : (paymentData.customer_id ? 'provided' : 'none'),
        paymentMethod: paymentData.payment_method,
      });
      
      const response: any = await paymentsApi.create(paymentRequest);
      
      Logger.info('Square payment API response received', {
        orderId: paymentData.order_id,
        hasBody: !!response.body,
        hasResult: !!response.result,
        hasPayment: !!response.payment,
        statusCode: response.statusCode || response.status,
        responseKeys: Object.keys(response),
        hasErrors: !!(response.errors || response.body?.errors || response.result?.errors),
      });
      
      // SDK v40+ returns data directly on response object, not nested in body/result
      const squarePayment = response.payment || response.body?.payment || response.result?.payment;
      
      if (squarePayment) {
        const paymentStatus = squarePayment.status === 'COMPLETED' ? 'completed' : 
                             squarePayment.status === 'FAILED' ? 'failed' : 'pending';
        
        Logger.info('Square payment details extracted', {
          orderId: paymentData.order_id,
          squarePaymentId: squarePayment.id,
          paymentStatus: squarePayment.status,
          mappedStatus: paymentStatus,
          squareCustomerId: squarePayment.customerId || 'none',
          hasCardDetails: !!squarePayment.cardDetails,
        });
        
        // Extract card information if available
        const cardDetails = squarePayment.cardDetails;
        const cardLast4 = cardDetails?.card?.last4;
        const cardBrand = cardDetails?.card?.cardBrand;
        const squareCardId = squarePayment.cardDetails?.card?.id;

        Logger.info('Card details extracted', {
          orderId: paymentData.order_id,
          cardLast4: cardLast4 || 'none',
          cardBrand: cardBrand || 'none',
          squareCardId: squareCardId || 'none',
        });

        // Determine the final customer ID to use
        const finalCustomerIdForTransaction = correctCustomerId || squarePayment.customerId || paymentData.customer_id;
        
        Logger.info('Creating payment transaction record', {
          orderId: paymentData.order_id,
          squarePaymentId: squarePayment.id,
          amount: paymentData.amount,
          paymentStatus,
          finalCustomerId: finalCustomerIdForTransaction || 'none',
          customerIdSource: correctCustomerId ? 'found/created' : 
                           (squarePayment.customerId ? 'from-square-payment' : 
                           (paymentData.customer_id ? 'provided' : 'none')),
          cardLast4: cardLast4 || 'none',
          cardBrand: cardBrand || 'none',
          squareCardId: squareCardId || 'none',
        });

        // Create payment transaction record
        // Use the correct customer ID we found/created, not the one from paymentData
        const transactionData: CreatePaymentTransactionDTO = {
          order_id: paymentData.order_id,
          square_payment_id: squarePayment.id || '',
          amount: paymentData.amount,
          currency: 'USD',
          payment_method: paymentData.payment_method,
          card_last_4: cardLast4,
          card_brand: cardBrand,
          status: paymentStatus,
          square_customer_id: finalCustomerIdForTransaction,
          square_card_id: squareCardId,
          error_message: paymentStatus === 'failed' ? squarePayment.receiptNumber : undefined,
          processed_by: adminUserId,
        };

        const transaction = await this.paymentRepository.createTransaction(transactionData);

        Logger.info('Payment transaction saved to database', {
          transactionId: transaction.id,
          orderId: paymentData.order_id,
          squarePaymentId: transaction.square_payment_id,
          squareCustomerId: transaction.square_customer_id || 'none',
          status: transaction.status,
          amount: transaction.amount,
        });

        // If payment is completed, update order is_paid to true
        if (paymentStatus === 'completed') {
          Logger.info('Updating order payment status to paid', {
            orderId: paymentData.order_id,
            previousStatus: order.status,
          });
          await this.orderRepository.update(paymentData.order_id, { is_paid: true });
          Logger.info('Order payment status updated to paid', {
            orderId: paymentData.order_id,
          });
        }

        // Handle card storage if requested
        // Use the correct customer ID for card storage
        let storedCard: StoredCard | undefined;
        const customerIdForCardStorage = correctCustomerId || paymentData.customer_id;
        if (paymentData.store_card && customerIdForCardStorage && squareCardId) {
          Logger.info('Storing card for future use', {
            orderId: paymentData.order_id,
            clientId: order.client_id || 0,
            squareCustomerId: customerIdForCardStorage,
            squareCardId,
            cardLast4: cardLast4 || 'none',
            cardBrand: cardBrand || 'none',
            isDefault: paymentData.use_stored_card || false,
          });
          storedCard = await this.storeCardFromPayment(
            order.client_id || 0,
            customerIdForCardStorage,
            squareCardId,
            cardLast4 || '',
            cardBrand || 'Unknown',
            paymentData.use_stored_card || false
          );
          Logger.info('Card stored successfully', {
            storedCardId: storedCard.id,
            orderId: paymentData.order_id,
          });
        }

        Logger.info('=== PAYMENT PROCESSING SUCCESS ===', {
          orderId: paymentData.order_id,
          transactionId: transaction.id,
          squarePaymentId: squarePayment.id,
          squareCustomerId: finalCustomerIdForTransaction || 'none',
          paymentStatus,
          amount: paymentData.amount,
          orderStatusUpdated: paymentStatus === 'completed',
          cardStored: !!storedCard,
        });

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
        
        Logger.error('=== PAYMENT PROCESSING FAILED ===', {
          orderId: paymentData.order_id,
          errorCode,
          errorMessage,
          statusCode: response.statusCode || response.status,
          errors: this.safeSerialize(errors),
          errorCount: errors.length,
          paymentRequest: {
            amount: paymentData.amount,
            customerId: finalCustomerId || 'none',
            sourceId: paymentData.source_id,
            locationId: locationId,
          },
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
      Logger.error('=== PAYMENT PROCESSING EXCEPTION ===', {
        orderId: paymentData.order_id,
        amount: paymentData.amount,
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        errorCode: error.code,
        errorResponse: this.safeSerialize(error.response),
        errorBody: this.safeSerialize(error.body),
        errorResult: this.safeSerialize(error.result),
        paymentData: {
          order_id: paymentData.order_id,
          amount: paymentData.amount,
          payment_method: paymentData.payment_method,
          hasSourceId: !!paymentData.source_id,
          providedCustomerId: paymentData.customer_id || 'none',
        },
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
   * Helper to safely serialize objects with potential BigInt values for logging
   */
  private safeSerialize(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'bigint') {
      return obj.toString();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.safeSerialize(item));
    }
    
    if (typeof obj === 'object') {
      const serialized: any = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          serialized[key] = this.safeSerialize(obj[key]);
        }
      }
      return serialized;
    }
    
    return obj;
  }

  /**
   * Find or create a Square customer for a client
   * This ensures payments are associated with the correct customer in Square
   */
  private async findOrCreateSquareCustomer(
    clientId: number | undefined,
    email?: string,
    clientName?: string,
    contactNumber?: string
  ): Promise<string | null> {
    Logger.info('=== FIND OR CREATE SQUARE CUSTOMER START ===', {
      clientId: clientId || 'none',
      email: email || 'none',
      clientName: clientName || 'none',
      contactNumber: contactNumber || 'none',
      timestamp: new Date().toISOString(),
    });

    try {
      // Verify Square client is initialized
      if (!this.squareClient) {
        Logger.error('Square client not initialized in findOrCreateSquareCustomer', {
          clientId,
          email: email || 'none',
        });
        return null;
      }

      const customersApi = this.squareClient.customers;
      if (!customersApi) {
        Logger.error('Square customers API not available', {
          clientId,
          email: email || 'none',
          hasSquareClient: !!this.squareClient,
        });
        return null;
      }

      Logger.info('Square customers API available', {
        clientId: clientId || 'none',
        email: email || 'none',
      });

      // First, check if client already has a Square customer ID stored
      let existingCustomerId: string | null = null;
      if (clientId) {
        Logger.info('Checking client record for stored Square customer ID', {
          clientId,
        });
        const client = await this.clientRepository.findById(clientId);
        if (client?.square_customer_id) {
          existingCustomerId = client.square_customer_id;
          Logger.info('✓ Found existing Square customer ID in client record', {
            clientId,
            squareCustomerId: existingCustomerId,
            clientName: client.full_name || client.company_name || 'none',
            clientEmail: client.email || 'none',
          });
          return existingCustomerId;
        } else {
          Logger.info('No stored Square customer ID found in client record', {
            clientId,
            hasClient: !!client,
            clientName: client?.full_name || client?.company_name || 'none',
            clientEmail: client?.email || 'none',
          });
        }
      } else {
        Logger.info('No client ID provided, will search/create by email only', {
          email: email || 'none',
        });
      }

      // If no stored customer ID, search for existing customer by email (if email is provided)
      if (email) {
        Logger.info('Searching for existing Square customer by email', {
          email,
          clientId: clientId || 'none',
        });
        try {
          const searchResponse: any = await customersApi.search({
            query: {
              filter: {
                emailAddress: {
                  exact: email,
                },
              },
            },
          });

          Logger.info('Square customer search response received', {
            email,
            hasBody: !!searchResponse.body,
            hasResult: !!searchResponse.result,
            hasCustomers: !!(searchResponse.body?.customers || searchResponse.result?.customers),
          });

          const customers = searchResponse.body?.customers || searchResponse.result?.customers || [];
          Logger.info('Square customer search results', {
            email,
            customerCount: customers.length,
            customerIds: customers.map((c: any) => c.id),
          });

          if (customers && customers.length > 0) {
            const foundCustomerId = customers[0].id;
            const foundCustomer = customers[0];
            Logger.info('✓ Found existing Square customer by email', {
              customerId: foundCustomerId,
              email,
              clientId: clientId || 'none',
              customerName: `${foundCustomer.givenName || ''} ${foundCustomer.familyName || ''}`.trim() || 'none',
              customerEmail: foundCustomer.emailAddress || 'none',
            });
            
            // Save the found customer ID to the client record for future use
            if (clientId && foundCustomerId) {
              try {
                Logger.info('Saving found Square customer ID to client record', {
                  clientId,
                  squareCustomerId: foundCustomerId,
                });
                await this.clientRepository.updateSquareCustomerId(clientId, foundCustomerId);
                Logger.info('✓ Saved Square customer ID to client record', {
                  clientId,
                  squareCustomerId: foundCustomerId,
                });
              } catch (saveError: any) {
                Logger.warn('Failed to save Square customer ID to client record', {
                  error: saveError.message,
                  errorStack: saveError.stack,
                  clientId,
                  squareCustomerId: foundCustomerId,
                });
              }
            }
            
            Logger.info('=== FIND OR CREATE SQUARE CUSTOMER SUCCESS (FOUND) ===', {
              clientId: clientId || 'none',
              squareCustomerId: foundCustomerId,
              email,
              source: 'existing-customer-by-email',
            });
            return foundCustomerId || null;
          } else {
            Logger.info('No existing Square customer found by email', {
              email,
              clientId: clientId || 'none',
            });
          }
        } catch (searchError: any) {
          Logger.warn('Square customer search failed, will create new one', {
            error: searchError.message,
            errorStack: searchError.stack,
            errorCode: searchError.code,
            errorResponse: this.safeSerialize(searchError.response),
            errorBody: this.safeSerialize(searchError.body),
            email,
          });
        }
      } else {
        Logger.info('No email provided, cannot search for existing customer', {
          clientId: clientId || 'none',
        });
      }

      // If no customer found, create a new one in Square
      // Square requires at least email or phone number for customer creation
      if (!email && !contactNumber) {
        Logger.error('=== FIND OR CREATE SQUARE CUSTOMER FAILED ===', {
          reason: 'Cannot create Square customer: no email or phone number provided',
          clientId: clientId || 'none',
          email: email || 'none',
          contactNumber: contactNumber || 'none',
        });
        return null;
      }

      // Build request body
      const requestBody: any = {
        givenName: clientName || 'Client',
        familyName: clientId ? `#${clientId}` : 'Customer',
        emailAddress: email,
        phoneNumber: contactNumber,
        note: clientId ? `Client ID: ${clientId}` : email ? `Payment customer: ${email}` : 'Payment customer',
      };

      Logger.info('Creating new Square customer', {
        requestBody: this.safeSerialize(requestBody),
        clientId: clientId || 'none',
        email: email || 'none',
        contactNumber: contactNumber || 'none',
        clientName: clientName || 'none',
      });

      let createResponse: any;
      try {
        createResponse = await customersApi.create(requestBody);
      } catch (createError: any) {
        Logger.error('Square customer create API call failed', {
          errorMessage: createError.message,
          errorStack: createError.stack,
          errorCode: createError.code,
          errorResponse: this.safeSerialize(createError.response),
          errorBody: this.safeSerialize(createError.body),
          errorResult: this.safeSerialize(createError.result),
          requestBody: this.safeSerialize(requestBody),
          clientId,
        });
        throw createError;
      }
      
      Logger.info('Square customer create response received', {
        hasBody: !!createResponse.body,
        hasResult: !!createResponse.result,
        hasCustomerDirect: !!createResponse.customer,
        hasCustomerInBody: !!createResponse.body?.customer,
        hasCustomerInResult: !!createResponse.result?.customer,
        statusCode: createResponse.statusCode,
        responseKeys: Object.keys(createResponse),
      });
      
      // Check multiple possible response structures
      const customer = createResponse.customer 
        || createResponse.body?.customer 
        || createResponse.result?.customer;
      
      if (customer?.id) {
        const newCustomerId = customer.id;
        Logger.info('✓ Created new Square customer', {
          customerId: newCustomerId,
          email: email || 'none',
          clientId: clientId || 'none',
          customerName: `${customer.givenName || ''} ${customer.familyName || ''}`.trim() || 'none',
          customerEmail: customer.emailAddress || 'none',
        });

        // Save the new customer ID to the client record for future use
        if (clientId && newCustomerId) {
          try {
            Logger.info('Saving new Square customer ID to client record', {
              clientId,
              squareCustomerId: newCustomerId,
            });
            await this.clientRepository.updateSquareCustomerId(clientId, newCustomerId);
            Logger.info('✓ Saved new Square customer ID to client record', {
              clientId,
              squareCustomerId: newCustomerId,
            });
          } catch (saveError: any) {
            Logger.warn('Failed to save new Square customer ID to client record', {
              error: saveError.message,
              errorStack: saveError.stack,
              clientId,
              squareCustomerId: newCustomerId,
            });
          }
        }

        Logger.info('=== FIND OR CREATE SQUARE CUSTOMER SUCCESS (CREATED) ===', {
          clientId: clientId || 'none',
          squareCustomerId: newCustomerId,
          email: email || 'none',
          source: 'newly-created-customer',
        });
        return newCustomerId;
      }

      Logger.error('=== FIND OR CREATE SQUARE CUSTOMER FAILED ===', {
        reason: 'Failed to create Square customer - no ID returned',
        response: this.safeSerialize(createResponse),
        email: email || 'none',
        clientId: clientId || 'none',
        requestBody: this.safeSerialize(requestBody),
      });
      return null;
    } catch (error: any) {
      Logger.error('=== FIND OR CREATE SQUARE CUSTOMER EXCEPTION ===', {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        errorCode: error.code,
        errorResponse: this.safeSerialize(error.response),
        errorBody: this.safeSerialize(error.body),
        errorResult: this.safeSerialize(error.result),
        email: email || 'none',
        clientId: clientId || 'none',
        clientName: clientName || 'none',
        contactNumber: contactNumber || 'none',
      });
      
      // Check if it's a Square API error with more details
      if (error.result?.errors || error.body?.errors) {
        const errors = error.result?.errors || error.body?.errors;
        Logger.error('Square API errors in findOrCreateSquareCustomer', {
          errors: this.safeSerialize(errors),
          errorCount: Array.isArray(errors) ? errors.length : 1,
          errorDetails: Array.isArray(errors) ? errors.map((e: any) => ({
            code: e.code,
            detail: e.detail,
            field: e.field,
            category: e.category,
          })) : [],
        });
      }
      
      return null;
    }
  }

  /**
   * Create a Square customer (for storing cards)
   * @deprecated Use findOrCreateSquareCustomer instead
   */
  async createSquareCustomer(
    clientId: number,
    email?: string,
    phoneNumber?: string
  ): Promise<string | null> {
    return this.findOrCreateSquareCustomer(clientId, email, undefined, phoneNumber);
  }

  /**
   * Process payment from Square invoice webhook
   * This unifies invoice payments with manual payments - both create PaymentTransaction and update order status
   */
  async processInvoicePayment(
    squareInvoiceId: string,
    squarePaymentId: string,
    amount: number
  ): Promise<ProcessPaymentResponse> {
    Logger.info('=== PROCESS INVOICE PAYMENT START ===', {
      squareInvoiceId,
      squarePaymentId,
      amount,
      timestamp: new Date().toISOString(),
    });

    try {
      // Find invoice by Square invoice ID
      Logger.info('Looking up invoice in database', {
        squareInvoiceId,
      });

      const invoice = await this.invoiceRepository.findBySquareInvoiceId(squareInvoiceId);
      if (!invoice) {
        Logger.error('=== PROCESS INVOICE PAYMENT FAILED ===', {
          reason: 'Invoice not found for payment',
          squareInvoiceId,
          squarePaymentId,
          amount,
        });
        return {
          success: false,
          error: 'Invoice not found',
        };
      }

      Logger.info('✓ Invoice found in database', {
        invoiceId: invoice.id,
        squareInvoiceId: invoice.square_invoice_id,
        orderId: invoice.order_id,
        invoiceStatus: invoice.status,
        invoiceAmount: invoice.amount,
        currency: invoice.currency,
        recipientEmail: invoice.recipient_email || 'none',
        deliveryMethod: invoice.delivery_method,
        createdBy: invoice.created_by,
      });

      // Get order to verify it exists
      Logger.info('Looking up order for invoice payment', {
        orderId: invoice.order_id,
      });

      const order = await this.orderRepository.findById(invoice.order_id);
      if (!order) {
        Logger.error('=== PROCESS INVOICE PAYMENT FAILED ===', {
          reason: 'Order not found for invoice payment',
          invoiceId: invoice.id,
          orderId: invoice.order_id,
          squareInvoiceId,
          squarePaymentId,
        });
        return {
          success: false,
          error: 'Order not found',
        };
      }

      Logger.info('✓ Order found for invoice payment', {
        orderId: order.id,
        orderNumber: order.order_number,
        orderStatus: order.status,
        orderTotal: order.total,
        clientId: order.client?.id || 'none',
        clientName: order.client?.full_name || order.client?.company_name || order.client_name || 'none',
        clientEmail: order.client?.email || 'none',
      });

      // Create payment transaction (same as manual payments)
      Logger.info('Creating payment transaction record', {
        orderId: invoice.order_id,
        squarePaymentId,
        amount,
        currency: invoice.currency || 'USD',
        paymentMethod: 'card',
        status: 'completed',
        processedBy: invoice.created_by,
      });

      const transactionData: CreatePaymentTransactionDTO = {
        order_id: invoice.order_id,
        square_payment_id: squarePaymentId,
        amount: amount,
        currency: invoice.currency || 'USD',
        payment_method: 'card', // Invoice payments are typically card payments
        status: 'completed',
        processed_by: invoice.created_by, // Use the admin who created the invoice
      };

      const transaction = await this.paymentRepository.createTransaction(transactionData);

      Logger.info('✓ Payment transaction created', {
        transactionId: transaction.id,
        orderId: invoice.order_id,
        squarePaymentId: transaction.square_payment_id,
        amount: transaction.amount,
        status: transaction.status,
        squareCustomerId: transaction.square_customer_id || 'none',
      });

      // Update order payment status to paid (same as manual payments)
      Logger.info('Updating order payment status to paid', {
        orderId: invoice.order_id,
        previousStatus: order.status,
      });

      await this.orderRepository.update(invoice.order_id, { is_paid: true });

      Logger.info('✓ Order payment status updated to paid', {
        orderId: invoice.order_id,
      });

      // Update invoice status to 'paid'
      Logger.info('Updating invoice status to paid', {
        invoiceId: invoice.id,
        previousStatus: invoice.status,
      });

      await this.invoiceRepository.updateStatus(invoice.id!, {
        status: 'paid',
        paid_at: new Date(),
      });

      Logger.info('✓ Invoice status updated to paid', {
        invoiceId: invoice.id,
        paidAt: new Date().toISOString(),
      });

      Logger.info('=== PROCESS INVOICE PAYMENT SUCCESS ===', {
        invoiceId: invoice.id,
        orderId: invoice.order_id,
        transactionId: transaction.id,
        squarePaymentId,
        amount,
        orderStatusUpdated: true,
        invoiceStatusUpdated: true,
      });

      return {
        success: true,
        payment_transaction: transaction,
      };
    } catch (error: any) {
      Logger.error('=== PROCESS INVOICE PAYMENT EXCEPTION ===', {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        errorCode: error.code,
        squareInvoiceId,
        squarePaymentId,
        amount,
        errorResponse: this.safeSerialize(error.response),
        errorBody: this.safeSerialize(error.body),
        errorResult: this.safeSerialize(error.result),
      });
      return {
        success: false,
        error: error.message || 'Failed to process invoice payment',
      };
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

