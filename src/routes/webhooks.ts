import { Router, Request, Response } from 'express';
import { getPaymentService } from '../services/payment.service';
import { getInvoiceRepository } from '../repositories';
import { Logger } from '../utils/logger';
import crypto from 'crypto';

export const webhookRouter = Router();

const invoiceRepository = getInvoiceRepository();
const paymentService = getPaymentService();

/**
 * Verify Square webhook signature
 */
function verifyWebhookSignature(
  payload: string,
  signature: string,
  signatureKey: string
): boolean {
  try {
    const hmac = crypto.createHmac('sha256', signatureKey);
    hmac.update(payload);
    const computedSignature = hmac.digest('base64');
    return computedSignature === signature;
  } catch (error) {
    Logger.error('Failed to verify webhook signature', error);
    return false;
  }
}

/**
 * Main webhook handler for all Square events
 * 
 * To configure:
 * 1. Get your webhook signature key from Square Developer Console:
 *    - Go to your app → Webhooks → Subscriptions → [Your Subscription]
 *    - Copy the "Signature Key" (click "Show" to reveal it)
 *    - Set it as environment variable: SQUARE_WEBHOOK_SIGNATURE_KEY
 * 
 * 2. Optional: Verify subscription ID matches expected value:
 *    - Get your subscription ID from the same page
 *    - Set it as environment variable: SQUARE_WEBHOOK_SUBSCRIPTION_ID (optional)
 */
async function handleSquareWebhook(req: Request, res: Response) {
  try {
    // Verify webhook signature if signature key is configured
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    const expectedSubscriptionId = process.env.SQUARE_WEBHOOK_SUBSCRIPTION_ID;
    const signature = req.headers['x-square-signature'] as string;

    if (signatureKey && signature) {
      const payload = JSON.stringify(req.body);
      if (!verifyWebhookSignature(payload, signature, signatureKey)) {
        Logger.warn('Invalid webhook signature - rejecting request', {
          signature: signature.substring(0, 20) + '...',
          hasPayload: !!req.body,
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
      Logger.info('Webhook signature verified successfully');
    } else if (!signatureKey) {
      Logger.warn('Webhook signature verification not configured - webhook will be accepted without verification', {
        hint: 'Set SQUARE_WEBHOOK_SIGNATURE_KEY environment variable to enable signature verification',
      });
    } else {
      Logger.warn('Webhook signature key configured but no signature header received', {
        hasSignatureKey: !!signatureKey,
        headers: Object.keys(req.headers),
      });
    }

    const event = req.body;
    const eventType = event.type;
    
    // Extract subscription ID from event or headers if available
    const subscriptionId = event.subscription_id || req.headers['x-square-subscription-id'] as string;

    // Optionally verify subscription ID matches expected value
    if (expectedSubscriptionId && subscriptionId && subscriptionId !== expectedSubscriptionId) {
      Logger.warn('Webhook subscription ID mismatch', {
        expected: expectedSubscriptionId,
        received: subscriptionId,
        eventType,
      });
      // Don't reject - just log for monitoring
    }

    Logger.info('Received Square webhook', {
      type: eventType,
      eventId: event.event_id,
      merchantId: event.merchant_id,
      subscriptionId: subscriptionId || 'not provided',
      subscriptionIdVerified: expectedSubscriptionId ? (subscriptionId === expectedSubscriptionId) : 'not configured',
      createdAt: event.created_at,
      signatureVerified: !!(signatureKey && signature),
    });

    // Handle invoice payment fulfilled event
    if (eventType === 'invoice.payment.fulfilled') {
      Logger.info('=== INVOICE PAYMENT WEBHOOK START ===', {
        eventType,
        eventId: event.event_id,
        merchantId: event.merchant_id,
        timestamp: new Date().toISOString(),
      });

      const invoicePayment = event.data?.object?.invoice_payment;
      const invoice = event.data?.object?.invoice;

      Logger.info('Invoice payment webhook data extracted', {
        hasInvoicePayment: !!invoicePayment,
        hasInvoice: !!invoice,
        invoicePaymentData: invoicePayment ? {
          payment_id: invoicePayment.payment_id,
          amount_paid: invoicePayment.amount_paid,
          status: invoicePayment.status,
        } : 'none',
        invoiceData: invoice ? {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          reference_id: invoice.reference_id,
          status: invoice.status,
          customer_id: invoice.primary_recipient?.customer_id,
        } : 'none',
      });

      if (!invoicePayment || !invoice) {
        Logger.error('=== INVOICE PAYMENT WEBHOOK FAILED ===', {
          reason: 'Invalid invoice payment webhook data',
          eventType,
          hasInvoicePayment: !!invoicePayment,
          hasInvoice: !!invoice,
          eventData: event.data,
        });
        return res.status(400).json({ error: 'Invalid webhook data' });
      }

      const squareInvoiceId = invoice.id;
      const squarePaymentId = invoicePayment.payment_id;
      const amount = parseFloat(invoicePayment.amount_paid?.amount || '0') / 100; // Convert from cents
      const squareCustomerId = invoice.primary_recipient?.customer_id;

      Logger.info('Invoice payment details extracted', {
        squareInvoiceId,
        squarePaymentId,
        amount,
        amountInCents: invoicePayment.amount_paid?.amount,
        currency: invoicePayment.amount_paid?.currency || 'USD',
        squareCustomerId: squareCustomerId || 'none',
        invoiceNumber: invoice.invoice_number || 'none',
        invoiceStatus: invoice.status || 'none',
        paymentStatus: invoicePayment.status || 'none',
      });

      // Extract order_id from invoice referenceId or database
      // We stored order_id as referenceId when creating the invoice
      let orderId: number | null = null;

      Logger.info('Looking up invoice in database', {
        squareInvoiceId,
      });

      // Try to find invoice by Square invoice ID
      const dbInvoice = await invoiceRepository.findBySquareInvoiceId(squareInvoiceId);
      if (dbInvoice) {
        orderId = parseInt(dbInvoice.reference_id);
        Logger.info('✓ Found invoice in database', {
          invoiceId: dbInvoice.id,
          squareInvoiceId: dbInvoice.square_invoice_id,
          orderId,
          invoiceStatus: dbInvoice.status,
          invoiceAmount: dbInvoice.amount,
          recipientEmail: dbInvoice.recipient_email || 'none',
        });
      } else {
        Logger.warn('Invoice not found in database, trying referenceId from Square invoice', {
          squareInvoiceId,
        });
        // Fallback: try to extract from invoice referenceId field
        if (invoice.referenceId) {
          orderId = parseInt(invoice.referenceId);
          Logger.info('Extracted order ID from Square invoice referenceId', {
            squareInvoiceId,
            referenceId: invoice.referenceId,
            orderId,
          });
        }
      }

      if (!orderId) {
        Logger.error('=== INVOICE PAYMENT WEBHOOK FAILED ===', {
          reason: 'Could not find order ID for invoice payment',
          squareInvoiceId,
          squarePaymentId,
          amount,
          dbInvoiceFound: !!dbInvoice,
          invoiceReferenceId: invoice.referenceId || 'none',
        });
        return res.status(400).json({ error: 'Could not determine order ID' });
      }

      Logger.info('Processing invoice payment', {
        squareInvoiceId,
        squarePaymentId,
        orderId,
        amount,
        squareCustomerId: squareCustomerId || 'none',
      });

      // Process invoice payment (creates PaymentTransaction and updates order status)
      const result = await paymentService.processInvoicePayment(
        squareInvoiceId,
        squarePaymentId,
        amount
      );

      if (!result.success) {
        Logger.error('=== INVOICE PAYMENT WEBHOOK FAILED ===', {
          reason: 'Failed to process invoice payment',
          squareInvoiceId,
          squarePaymentId,
          orderId,
          amount,
          error: result.error,
          transactionCreated: !!result.payment_transaction,
        });
        return res.status(500).json({ error: result.error || 'Failed to process payment' });
      }

      Logger.info('=== INVOICE PAYMENT WEBHOOK SUCCESS ===', {
        squareInvoiceId,
        squarePaymentId,
        orderId,
        amount,
        transactionId: result.payment_transaction?.id,
        squareCustomerId: squareCustomerId || 'none',
        transactionStatus: result.payment_transaction?.status,
        orderStatusUpdated: true,
      });

      return res.json({
        success: true,
        message: 'Invoice payment processed successfully',
      });
    }

    // Handle other invoice events
    if (eventType?.startsWith('invoice.')) {
      Logger.info('Unhandled invoice webhook event', {
        type: eventType,
        eventId: event.event_id,
        data: event.data,
      });
      return res.json({
        success: true,
        message: `Invoice event ${eventType} received but not processed`,
      });
    }

    // Handle payment events (if needed in the future)
    if (eventType?.startsWith('payment.')) {
      Logger.info('Payment webhook event received', {
        type: eventType,
        eventId: event.event_id,
        paymentId: event.data?.object?.payment?.id,
      });
      return res.json({
        success: true,
        message: `Payment event ${eventType} received but not processed`,
      });
    }

    // Handle customer events (if needed in the future)
    if (eventType?.startsWith('customer.')) {
      Logger.info('Customer webhook event received', {
        type: eventType,
        eventId: event.event_id,
        customerId: event.data?.object?.customer?.id,
      });
      return res.json({
        success: true,
        message: `Customer event ${eventType} received but not processed`,
      });
    }

    // Handle order events (if needed in the future)
    if (eventType?.startsWith('order.')) {
      Logger.info('Order webhook event received', {
        type: eventType,
        eventId: event.event_id,
        orderId: event.data?.object?.order?.id,
      });
      return res.json({
        success: true,
        message: `Order event ${eventType} received but not processed`,
      });
    }

    // Log all other unhandled events for monitoring
    Logger.info('Unhandled webhook event type', {
      type: eventType,
      eventId: event.event_id,
      merchantId: event.merchant_id,
      eventCategory: eventType?.split('.')[0] || 'unknown',
    });

    return res.json({
      success: true,
      message: `Webhook event ${eventType} received but not processed`,
    });
  } catch (error: any) {
    Logger.error('Webhook processing error', error, {
      body: req.body,
    });
    return res.status(500).json({
      error: error.message || 'Webhook processing failed',
    });
  }
}

/**
 * @swagger
 * /webhooks/square:
 *   post:
 *     summary: Webhook endpoint for all Square events
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
webhookRouter.post('/square', handleSquareWebhook);

/**
 * Legacy route for backward compatibility
 * @deprecated Use /webhooks/square instead
 * @swagger
 * /webhooks/square/invoices:
 *   post:
 *     summary: Webhook endpoint for Square invoice events (legacy)
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 */
webhookRouter.post('/square/invoices', handleSquareWebhook);

