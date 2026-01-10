import { SquareClient, SquareEnvironment } from 'square';
import { v4 as uuidv4 } from 'uuid';
import { getInvoiceRepository, getOrderRepository, getClientRepository } from '../repositories';
import { Invoice, CreateInvoiceDTO, InvoiceLineItem } from '../models/invoice';
import { Order } from '../models/order';
import { Logger } from '../utils/logger';

export interface CreateInvoiceOptions {
  delivery_method: 'EMAIL' | 'SHARE_MANUALLY';
  recipient_email?: string;
}

export interface CreateInvoiceResponse {
  success: boolean;
  invoice?: Invoice;
  public_url?: string;
  error?: string;
  invoiceVersion?: number; // Square invoice version for publishing
}

export class InvoiceService {
  private invoiceRepository = getInvoiceRepository();
  private orderRepository = getOrderRepository();
  private clientRepository = getClientRepository();
  private squareClient: SquareClient;
  private locationId: string;

  constructor() {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const environment = process.env.SQUARE_ENVIRONMENT === 'production' 
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox;
    const locationId = process.env.SQUARE_LOCATION_ID;

    if (!accessToken) {
      Logger.warn('Square access token not configured. Invoice processing will not work.');
      throw new Error('Square access token is required');
    }

    if (!locationId) {
      Logger.warn('Square location ID not configured. Invoice processing will not work.');
      throw new Error('Square location ID is required');
    }

    this.locationId = locationId;
    this.squareClient = new SquareClient({
      token: accessToken,
      environment: environment,
    });

    Logger.info('Invoice service initialized', {
      hasClient: !!this.squareClient,
      hasInvoices: !!this.squareClient.invoices,
      environment: environment === SquareEnvironment.Production ? 'production' : 'sandbox',
    });
  }

  /**
   * Helper to safely serialize objects with potential BigInt values for logging
   */
  private safeSerialize(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return obj.toString();
    if (Array.isArray(obj)) return obj.map(item => this.safeSerialize(item));
    if (typeof obj === 'object') {
      const result: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = this.safeSerialize(obj[key]);
        }
      }
      return result;
    }
    return obj;
  }

  /**
   * Find or create a Square customer for a client
   * First checks if client has a stored square_customer_id
   * If not, creates a new customer in Square and saves the ID to the client record
   * Returns the customer ID or null if creation fails
   */
  private async findOrCreateSquareCustomer(
    clientId: number | undefined,
    email?: string,
    clientName?: string,
    contactNumber?: string
  ): Promise<string | null> {
    try {
      // Verify Square client is initialized
      if (!this.squareClient) {
        Logger.error('Square client not initialized', {
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

      Logger.debug('Square customers API available', {
        clientId,
        email: email || 'none',
      });

      // First, check if client already has a Square customer ID stored
      // BUT: if email is provided and different from client email, we need to handle it
      // Square sends invoices to the email on the customer record, so we need to ensure
      // the customer's email matches the recipient email
      let existingCustomerId: string | null = null;
      if (clientId) {
        const client = await this.clientRepository.findById(clientId);
        if (client?.square_customer_id) {
          existingCustomerId = client.square_customer_id;
          
          // If we have a custom email that's different from client email, we need to:
          // 1. First search for a customer with the recipient email
          // 2. If found, use that customer (and update client record)
          // 3. If not found, update the existing customer's email in Square
          if (email && email !== client.email) {
            Logger.info('Custom recipient email differs from client email, will search/update customer', {
              clientId,
              clientEmail: client.email,
              recipientEmail: email,
              squareCustomerId: existingCustomerId,
            });
            // Don't return early - continue to search/update logic below
          } else {
            Logger.info('Using existing Square customer ID from client record', {
              clientId,
              squareCustomerId: existingCustomerId,
            });
            // If emails match (or no custom email), we can use the existing customer
            if (!email || email === client.email) {
              return existingCustomerId;
            }
            // If we reach here, we have email !== client.email, so continue to update logic
          }
        }
      }

      // If no stored customer ID, search for existing customer by email (if email is provided)
      if (email) {
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

          const customers = searchResponse.body?.customers || searchResponse.result?.customers || [];
          if (customers && customers.length > 0) {
            const foundCustomerId = customers[0].id;
            Logger.info('Found existing Square customer by email', {
              customerId: foundCustomerId,
              email,
              clientId,
            });
            
            // Save the found customer ID to the client record for future use
            if (clientId && foundCustomerId) {
              try {
                await this.clientRepository.updateSquareCustomerId(clientId, foundCustomerId);
                Logger.info('Saved Square customer ID to client record', {
                  clientId,
                  squareCustomerId: foundCustomerId,
                });
              } catch (saveError: any) {
                Logger.warn('Failed to save Square customer ID to client record', {
                  error: saveError.message,
                  clientId,
                  squareCustomerId: foundCustomerId,
                });
              }
            }
            
            return foundCustomerId || null;
          }
        } catch (searchError: any) {
          // If search fails, we'll try to update existing customer or create a new one
          Logger.warn('Customer search failed, will update existing customer or create new one', {
            error: searchError.message,
            email,
          });
        }
      }

      // If we have an existing customer ID but a different email, we need to handle it
      // Since Square sends invoices to the email on the customer record, and updating
      // customers requires version management, we'll create a new customer with the
      // custom email if one doesn't already exist. This ensures the invoice goes to
      // the correct email address.
      // Note: If a customer with the custom email already exists, we would have found
      // it in the search above, so at this point we know we need to create a new one.

      // If no customer found, create a new one in Square
      // Square requires at least email or phone number for customer creation
      if (!email && !contactNumber) {
        Logger.error('Cannot create Square customer: no email or phone number provided', {
          clientId,
          email: email || 'none',
          contactNumber: contactNumber || 'none',
        });
        return null;
      }

      // Build request body - match PaymentService pattern for consistency
      const requestBody: any = {
        givenName: clientName || 'Client',
        familyName: clientId ? `#${clientId}` : 'Customer',
        emailAddress: email, // Include even if undefined (Square will ignore it)
        phoneNumber: contactNumber, // Include even if undefined (Square will ignore it)
        note: clientId ? `Client ID: ${clientId}` : email ? `Invoice recipient: ${email}` : 'Invoice recipient',
      };

      Logger.info('Attempting to create Square customer', {
        requestBody: this.safeSerialize(requestBody),
        clientId,
        email: email || 'none',
        contactNumber: contactNumber || 'none',
      });

      let createResponse: any;
      try {
        createResponse = await customersApi.create(requestBody);
      } catch (createError: any) {
        // Log the error before rethrowing to see what Square is returning
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
        throw createError; // Re-throw to be caught by outer catch
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
      
      // Check multiple possible response structures (Square SDK may return different formats)
      const customer = createResponse.customer 
        || createResponse.body?.customer 
        || createResponse.result?.customer;
      
      if (customer?.id) {
        const newCustomerId = customer.id;
        Logger.info('Created new Square customer', {
          customerId: newCustomerId,
          email: email || 'none',
          clientId,
        });

        // Save the new customer ID to the client record for future use
        if (clientId && newCustomerId) {
          try {
            await this.clientRepository.updateSquareCustomerId(clientId, newCustomerId);
            Logger.info('Saved new Square customer ID to client record', {
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
            // Don't fail the whole operation if saving fails
          }
        }

        return newCustomerId;
      }

      // Log detailed error information
      Logger.error('Failed to create Square customer - no ID returned', {
        response: this.safeSerialize(createResponse),
        email: email || 'none',
        clientId,
        requestBody: this.safeSerialize(requestBody),
      });
      return null;
    } catch (error: any) {
      // Log the full error details (using safeSerialize to handle BigInt)
      Logger.error('Failed to find or create Square customer - exception caught', {
        errorMessage: error.message,
        errorStack: error.stack,
        errorResponse: this.safeSerialize(error.response),
        errorBody: this.safeSerialize(error.body),
        errorResult: this.safeSerialize(error.result),
        email: email || 'none',
        clientId,
      });
      
      // Check if it's a Square API error with more details
      if (error.result?.errors || error.body?.errors) {
        const errors = error.result?.errors || error.body?.errors;
        Logger.error('Square API errors', {
          errors: this.safeSerialize(errors),
          errorCount: Array.isArray(errors) ? errors.length : 1,
        });
        
        // Log each error individually for better visibility
        if (Array.isArray(errors)) {
          errors.forEach((err: any, index: number) => {
            Logger.error(`Square API error ${index + 1}`, {
              code: err.code,
              detail: err.detail,
              field: err.field,
              category: err.category,
            });
          });
        }
      }
      
      // Also check for error in different response structures
      if (error.errors && Array.isArray(error.errors)) {
        Logger.error('Square API errors (alternative structure)', {
          errors: this.safeSerialize(error.errors),
        });
      }
      
      return null;
    }
  }

  /**
   * Convert order to invoice line items
   * Includes all order items and fees
   */
  private convertOrderToLineItems(order: Order): InvoiceLineItem[] {
    const lineItems: InvoiceLineItem[] = [];

    // Add order items
    if (order.items && order.items.length > 0) {
      order.items.forEach((item) => {
        lineItems.push({
          name: item.item_name,
          quantity: item.portion_size || '1',
          unit_price: item.price,
          description: item.item_description || undefined,
        });
      });
    }

    // Add fees as separate line items
    if (order.service_charge > 0) {
      lineItems.push({
        name: 'Service Charge',
        quantity: '1',
        unit_price: order.service_charge,
      });
    }

    if (order.delivery_fee > 0) {
      lineItems.push({
        name: 'Delivery Fee',
        quantity: '1',
        unit_price: order.delivery_fee,
      });
    }

    if (order.coordination_fee > 0) {
      lineItems.push({
        name: 'Coordination Fee',
        quantity: '1',
        unit_price: order.coordination_fee,
      });
    }

    if (order.airport_fee > 0) {
      lineItems.push({
        name: 'Airport Fee',
        quantity: '1',
        unit_price: order.airport_fee,
      });
    }

    if (order.fbo_fee > 0) {
      lineItems.push({
        name: 'FBO Fee',
        quantity: '1',
        unit_price: order.fbo_fee,
      });
    }

    if (order.shopping_fee > 0) {
      lineItems.push({
        name: 'Shopping Fee',
        quantity: '1',
        unit_price: order.shopping_fee,
      });
    }

    if (order.restaurant_pickup_fee > 0) {
      lineItems.push({
        name: 'Restaurant Pickup Fee',
        quantity: '1',
        unit_price: order.restaurant_pickup_fee,
      });
    }

    if (order.airport_pickup_fee > 0) {
      lineItems.push({
        name: 'Airport Pickup Fee',
        quantity: '1',
        unit_price: order.airport_pickup_fee,
      });
    }

    return lineItems;
  }

  /**
   * Create a Square invoice from an order
   */
  async createInvoice(
    orderId: number,
    options: CreateInvoiceOptions,
    createdBy: number
  ): Promise<CreateInvoiceResponse> {
    try {
      // Get order with items
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        return {
          success: false,
          error: 'Order not found',
        };
      }

      // Check if an invoice already exists for this order
      const existingInvoices = await this.invoiceRepository.findByOrderId(orderId);
      const unsettledInvoice = existingInvoices.find(
        inv => inv.status === 'pending' || inv.status === 'failed'
      );

      // If an unsettled invoice exists, resend it instead of creating a new one
      if (unsettledInvoice) {
        Logger.info('Found existing unsettled invoice, will resend it', {
          invoiceId: unsettledInvoice.id,
          squareInvoiceId: unsettledInvoice.square_invoice_id,
          status: unsettledInvoice.status,
          orderId,
        });

        // Get the invoice from Square to get the current version
        const squareInvoiceResponse = await this.getInvoice(unsettledInvoice.square_invoice_id);
        
        if (squareInvoiceResponse.success && squareInvoiceResponse.invoice) {
          const squareInvoice = squareInvoiceResponse.invoice;
          const invoiceVersion = squareInvoice.version || 0;

          // Republish the invoice if it's not already published/scheduled
          if (squareInvoice.status !== 'SCHEDULED' && squareInvoice.status !== 'SENT') {
            Logger.info('Republishing existing invoice for resend', {
              invoiceId: unsettledInvoice.id,
              squareInvoiceId: unsettledInvoice.square_invoice_id,
              currentStatus: squareInvoice.status,
              version: invoiceVersion,
            });

            const publishResult = await this.publishInvoice(unsettledInvoice.id!, invoiceVersion);
            
            if (!publishResult.success) {
              Logger.warn('Failed to republish existing invoice, but returning it anyway', {
                invoiceId: unsettledInvoice.id,
                error: publishResult.error,
              });
            }
          } else {
            Logger.info('Invoice is already published/scheduled, no need to republish', {
              invoiceId: unsettledInvoice.id,
              squareInvoiceId: unsettledInvoice.square_invoice_id,
              status: squareInvoice.status,
            });
          }

          // Update public_url if available
          if (squareInvoice.publicUrl && !unsettledInvoice.public_url) {
            await this.invoiceRepository.updatePublicUrl(unsettledInvoice.id!, squareInvoice.publicUrl);
            unsettledInvoice.public_url = squareInvoice.publicUrl;
          }

          return {
            success: true,
            invoice: unsettledInvoice,
            public_url: unsettledInvoice.public_url,
            invoiceVersion: invoiceVersion,
          };
        } else {
          Logger.warn('Failed to retrieve existing invoice from Square, will create new one', {
            invoiceId: unsettledInvoice.id,
            squareInvoiceId: unsettledInvoice.square_invoice_id,
            error: squareInvoiceResponse.error,
          });
          // Continue to create new invoice below
        }
      }

      // If we're creating a new invoice, ensure the invoice number is unique
      // If there are existing invoices, append a suffix to make it unique
      // This handles the case where an unsettled invoice exists but we couldn't retrieve it from Square
      let invoiceNumber = order.order_number;
      if (existingInvoices.length > 0) {
        // Count how many invoices exist to create a unique suffix
        // Add 1 to the count to ensure uniqueness (e.g., if 1 invoice exists, use -2)
        const suffix = existingInvoices.length + 1;
        invoiceNumber = `${order.order_number}-${suffix}`;
        Logger.info('Using unique invoice number for new invoice', {
          originalOrderNumber: order.order_number,
          uniqueInvoiceNumber: invoiceNumber,
          existingInvoiceCount: existingInvoices.length,
          orderId,
        });
      }

      // Get recipient email - prioritize custom recipient_email over client email
      // This allows sending invoices to different email addresses (e.g., accounting@company.com)
      const recipientEmail = options.recipient_email || order.client?.email;
      if (!recipientEmail && options.delivery_method === 'EMAIL') {
        return {
          success: false,
          error: 'Recipient email is required for EMAIL delivery method',
        };
      }

      // Find or create Square customer for invoice recipient
      // Square requires customer_id even for SHARE_MANUALLY, so we always need a customer
      // First checks if client has a stored square_customer_id, otherwise creates/finds one
      // If using a custom email, we'll create/find a customer with that email
      // The customer name will still use the client's name if available
      
      // Ensure we have at least email or contact number for customer creation
      const hasEmail = !!(recipientEmail || order.client?.email);
      const hasContactNumber = !!order.client?.contact_number;
      
      if (!hasEmail && !hasContactNumber) {
        Logger.error('Cannot create invoice: no email or contact number available for Square customer creation', {
          orderId,
          hasClient: !!order.client,
          clientId: order.client?.id,
          recipientEmail: recipientEmail || 'none',
          clientEmail: order.client?.email || 'none',
          clientContactNumber: order.client?.contact_number || 'none',
          deliveryMethod: options.delivery_method,
        });
        return {
          success: false,
          error: 'Cannot create invoice: recipient email or contact number is required to create Square customer. Please add an email or phone number to the client record.',
        };
      }

      // Verify Square client is properly initialized
      if (!this.squareClient) {
        Logger.error('Square client not initialized in InvoiceService', {
          orderId,
          hasAccessToken: !!process.env.SQUARE_ACCESS_TOKEN,
          environment: process.env.SQUARE_ENVIRONMENT,
        });
        return {
          success: false,
          error: 'Square payment service is not properly configured. Please check SQUARE_ACCESS_TOKEN environment variable.',
        };
      }

      const customerId = await this.findOrCreateSquareCustomer(
        order.client?.id,
        recipientEmail || order.client?.email || undefined,
        order.client?.full_name || order.client?.company_name || order.client_name || undefined,
        order.client?.contact_number || undefined
      );
      
      if (!customerId) {
        Logger.error('Failed to find or create Square customer for invoice', {
          orderId,
          clientId: order.client?.id,
          recipientEmail: recipientEmail || 'none',
          hasClient: !!order.client,
          clientEmail: order.client?.email || 'none',
          clientContactNumber: order.client?.contact_number || 'none',
          clientName: order.client?.full_name || order.client?.company_name || 'none',
        });
        
        // Provide more helpful error message
        let errorMessage = 'Failed to find or create Square customer for invoice recipient. ';
        if (!recipientEmail && !order.client?.contact_number) {
          errorMessage += 'No email or contact number available for customer creation. ';
        }
        errorMessage += 'Please check server logs for detailed error information.';
        
        return {
          success: false,
          error: errorMessage,
        };
      }

      // Convert order to line items
      const lineItems = this.convertOrderToLineItems(order);

      // Ensure delivery_date is in YYYY-MM-DD format string
      // Convert to string if it's a Date object or ensure it's in the correct format
      let saleOrServiceDate: string;
      const deliveryDate = order.delivery_date as any; // Type assertion to handle runtime type
      
      if (deliveryDate instanceof Date) {
        saleOrServiceDate = deliveryDate.toISOString().split('T')[0];
      } else if (typeof deliveryDate === 'string') {
        // If it's already a string, validate it's in YYYY-MM-DD format
        // If it contains time or other format, extract just the date part
        if (deliveryDate.includes('T')) {
          saleOrServiceDate = deliveryDate.split('T')[0];
        } else if (deliveryDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          saleOrServiceDate = deliveryDate;
        } else {
          // Try to parse and reformat
          const date = new Date(deliveryDate);
          if (!isNaN(date.getTime())) {
            saleOrServiceDate = date.toISOString().split('T')[0];
          } else {
            saleOrServiceDate = new Date().toISOString().split('T')[0];
            Logger.warn('Invalid delivery_date format, using today\'s date', {
              orderId,
              delivery_date: deliveryDate,
            });
          }
        }
      } else {
        // Fallback: try to parse and format
        const date = new Date(deliveryDate);
        if (!isNaN(date.getTime())) {
          saleOrServiceDate = date.toISOString().split('T')[0];
        } else {
          // Last resort: use today's date
          saleOrServiceDate = new Date().toISOString().split('T')[0];
          Logger.warn('Invalid delivery_date, using today\'s date', {
            orderId,
            delivery_date: deliveryDate,
          });
        }
      }

      // Square requires an order_id for invoices, so we need to create a Square Order first
      // Create a Square Order with the line items
      Logger.info('Creating Square Order for invoice', {
        orderId,
        lineItemsCount: lineItems.length,
      });

      const squareOrderRequest: any = {
        locationId: this.locationId,
        referenceId: `INV-${orderId}`, // Reference to our internal order
        lineItems: lineItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          note: item.description,
          basePriceMoney: {
            amount: BigInt(Math.round(item.unit_price * 100)),
            currency: 'USD',
          },
        })),
      };

      let squareOrderId: string;
      try {
        const ordersApi = this.squareClient.orders;
        // Square Orders API uses create() method like other APIs (payments, customers, invoices)
        const squareOrderResponse: any = await ordersApi.create({
          order: squareOrderRequest,
          idempotencyKey: uuidv4(),
        } as any);

        // Extract Square Order ID from response
        const squareOrder = squareOrderResponse.order 
          || squareOrderResponse.body?.order 
          || squareOrderResponse.result?.order;

        if (!squareOrder?.id) {
          Logger.error('Failed to create Square Order - no ID returned', {
            response: this.safeSerialize(squareOrderResponse),
            orderId,
          });
          return {
            success: false,
            error: 'Failed to create Square Order for invoice',
          };
        }

        squareOrderId = squareOrder.id;
        Logger.info('Square Order created successfully', {
          squareOrderId,
          orderId,
        });
      } catch (orderError: any) {
        Logger.error('Failed to create Square Order', {
          errorMessage: orderError.message,
          errorStack: orderError.stack,
          errorResponse: this.safeSerialize(orderError.response),
          errorBody: this.safeSerialize(orderError.body),
          errorResult: this.safeSerialize(orderError.result),
          orderId,
        });
        return {
          success: false,
          error: `Failed to create Square Order: ${orderError.message || 'Unknown error'}`,
        };
      }

      // Create Square invoice request
      const invoiceRequest: any = {
        locationId: this.locationId,
        orderId: squareOrderId, // Use the Square Order ID we just created
        primaryRecipient: {
          customerId: customerId, // customerId is required by Square API
        },
        paymentRequests: [
          {
            requestType: 'BALANCE',
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
            tippingEnabled: false,
          },
        ],
        deliveryMethod: options.delivery_method,
        invoiceNumber: invoiceNumber, // Use unique invoice number (may have suffix if resending)
        title: `Invoice for Order ${order.order_number}`,
        description: `Invoice for order ${order.order_number}${order.description ? ` - ${order.description}` : ''}`,
        // scheduledAt must be in the future - set to 1 minute from now to ensure it's in the future
        scheduledAt: new Date(Date.now() + 60 * 1000).toISOString(),
        acceptedPaymentMethods: {
          card: true,
          squareGiftCard: false,
          bankAccount: options.delivery_method === 'EMAIL' ? (order.payment_method === 'ACH') : false,
          buyNowPayLater: false,
        },
        saleOrServiceDate: saleOrServiceDate, // YYYY-MM-DD format string
        referenceId: orderId.toString(), // Use referenceId field for webhook matching
      };

      // Add line items
      invoiceRequest.invoiceLineItems = lineItems.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        note: item.description,
        unitPrice: {
          amount: BigInt(Math.round(item.unit_price * 100)),
          currency: 'USD',
        },
      }));

      // referenceId is already set above for webhook matching

      // Create invoice via Square API
      const invoicesApi = this.squareClient.invoices;
      const response: any = await invoicesApi.create({
        invoice: invoiceRequest,
        idempotencyKey: uuidv4(),
      } as any);

      Logger.info('Square invoice creation response', {
        hasBody: !!response.body,
        hasResult: !!response.result,
        hasInvoice: !!response.invoice,
        status: response.statusCode || response.status,
      });

      const squareInvoice = response.invoice || response.body?.invoice || response.result?.invoice;

      if (!squareInvoice) {
        Logger.error('Failed to create Square invoice', {
          response: JSON.stringify(response),
        });
        return {
          success: false,
          error: 'Failed to create invoice in Square',
        };
      }

      // Store invoice in database
      const invoiceData: CreateInvoiceDTO = {
        order_id: orderId,
        square_invoice_id: squareInvoice.id || '',
        public_url: squareInvoice.publicUrl || undefined,
        reference_id: orderId.toString(), // Store order_id as reference_id for webhook matching
        status: 'pending',
        amount: order.total,
        currency: 'USD',
        delivery_method: options.delivery_method,
        recipient_email: recipientEmail,
        created_by: createdBy,
      };

      const invoice = await this.invoiceRepository.create(invoiceData);

      // Return the invoice version so it can be used for publishing
      const invoiceVersion = squareInvoice.version || 0;

      return {
        success: true,
        invoice,
        public_url: squareInvoice.publicUrl || undefined,
        invoiceVersion: invoiceVersion, // Include version for publishing
      };
    } catch (error: any) {
      Logger.error('Failed to create invoice', error, {
        orderId,
        options,
      });
      return {
        success: false,
        error: error.message || 'Failed to create invoice',
      };
    }
  }

  /**
   * Publish an invoice (makes it payable)
   */
  async publishInvoice(invoiceId: number, version: number): Promise<{ success: boolean; invoice?: Invoice; error?: string }> {
    try {
      const invoice = await this.invoiceRepository.findById(invoiceId);
      if (!invoice) {
        Logger.error('Invoice not found for publishing', { invoiceId });
        return {
          success: false,
          error: 'Invoice not found',
        };
      }

      Logger.info('Publishing Square invoice', {
        invoiceId,
        squareInvoiceId: invoice.square_invoice_id,
        version,
      });

      const invoicesApi = this.squareClient.invoices;
      const response: any = await invoicesApi.publish({
        invoiceId: invoice.square_invoice_id,
        version: version,
      } as any);

      Logger.info('Square publish invoice response', {
        hasBody: !!response.body,
        hasResult: !!response.result,
        hasInvoice: !!response.invoice,
        status: response.statusCode || response.status,
        invoiceId,
      });

      const squareInvoice = response.invoice || response.body?.invoice || response.result?.invoice;

      if (!squareInvoice) {
        Logger.error('Failed to publish invoice - no invoice in response', {
          response: this.safeSerialize(response),
          invoiceId,
          squareInvoiceId: invoice.square_invoice_id,
        });
        return {
          success: false,
          error: 'Failed to publish invoice in Square - no invoice returned',
        };
      }

      Logger.info('Invoice published successfully in Square', {
        invoiceId,
        squareInvoiceId: squareInvoice.id,
        status: squareInvoice.status,
        publicUrl: squareInvoice.publicUrl,
      });

      // Update public_url if available
      if (squareInvoice.publicUrl && !invoice.public_url) {
        await this.invoiceRepository.updatePublicUrl(invoiceId, squareInvoice.publicUrl);
        Logger.info('Updated invoice public_url', {
          invoiceId,
          publicUrl: squareInvoice.publicUrl,
        });
      }

      // Get updated invoice
      const updatedInvoice = await this.invoiceRepository.findById(invoiceId);

      return {
        success: true,
        invoice: updatedInvoice || undefined,
      };
    } catch (error: any) {
      Logger.error('Failed to publish invoice', {
        errorMessage: error.message,
        errorStack: error.stack,
        errorResponse: this.safeSerialize(error.response),
        errorBody: this.safeSerialize(error.body),
        errorResult: this.safeSerialize(error.result),
        invoiceId,
        version,
      });
      return {
        success: false,
        error: error.message || 'Failed to publish invoice',
      };
    }
  }

  /**
   * Get invoice details from Square
   */
  async getInvoice(squareInvoiceId: string): Promise<{ success: boolean; invoice?: any; error?: string }> {
    try {
      const invoicesApi = this.squareClient.invoices;
      const response: any = await invoicesApi.get({
        invoiceId: squareInvoiceId,
      } as any);

      const squareInvoice = response.invoice || response.body?.invoice || response.result?.invoice;

      if (!squareInvoice) {
        return {
          success: false,
          error: 'Invoice not found in Square',
        };
      }

      return {
        success: true,
        invoice: squareInvoice,
      };
    } catch (error: any) {
      Logger.error('Failed to get invoice from Square', error, {
        squareInvoiceId,
      });
      return {
        success: false,
        error: error.message || 'Failed to get invoice',
      };
    }
  }

  /**
   * Cancel an invoice
   */
  async cancelInvoice(invoiceId: number, version: number): Promise<{ success: boolean; invoice?: Invoice; error?: string }> {
    try {
      const invoice = await this.invoiceRepository.findById(invoiceId);
      if (!invoice) {
        return {
          success: false,
          error: 'Invoice not found',
        };
      }

      const invoicesApi = this.squareClient.invoices;
      const response: any = await invoicesApi.cancel({
        invoiceId: invoice.square_invoice_id,
        version: version,
      } as any);

      const squareInvoice = response.invoice || response.body?.invoice || response.result?.invoice;

      if (!squareInvoice) {
        return {
          success: false,
          error: 'Failed to cancel invoice in Square',
        };
      }

      // Update invoice status
      await this.invoiceRepository.updateStatus(invoiceId, {
        status: 'cancelled',
      });

      const updatedInvoice = await this.invoiceRepository.findById(invoiceId);

      return {
        success: true,
        invoice: updatedInvoice || undefined,
      };
    } catch (error: any) {
      Logger.error('Failed to cancel invoice', error, {
        invoiceId,
      });
      return {
        success: false,
        error: error.message || 'Failed to cancel invoice',
      };
    }
  }
}

let invoiceServiceInstance: InvoiceService | null = null;

export function getInvoiceService(): InvoiceService {
  // Always create a new instance to ensure latest env vars are picked up
  invoiceServiceInstance = new InvoiceService();
  return invoiceServiceInstance;
}

