import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export type EmailRecipient = 'client' | 'caterer' | 'both';
export type EmailPurpose = 'quote' | 'confirmation' | 'delivery' | 'invoice' | 'order_request' | 'quote_request' | 'update' | 'cancellation';
export type PDFFormat = 'A' | 'B';

export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}

/**
 * Get the appropriate PDF format based on recipient and purpose
 * PDF A = With pricing (for client quotes and invoices)
 * PDF B = Without pricing (for caterers and client confirmations)
 */
export function getPDFFormat(recipient: EmailRecipient, purpose: EmailPurpose): PDFFormat {
  // Caterer always gets PDF B (no pricing)
  if (recipient === 'caterer') {
    return 'B';
  }
  
  // Client emails
  switch (purpose) {
    case 'quote':
    case 'invoice':
      return 'A'; // With pricing
    case 'confirmation':
    case 'delivery':
    case 'update':
      return 'B'; // Without pricing
    default:
      return 'A';
  }
}

/**
 * Format delivery date for email subject (MM/DD/YYYY)
 */
function formatDateForSubject(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  
  // If it's in YYYY-MM-DD format, parse it directly to avoid timezone issues
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${month}/${day}/${year}`;
  }
  
  return '';
}

/**
 * Format delivery time for email subject (HH:mm)
 */
function formatTimeForSubject(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  // Remove trailing 'L' if present (aviation format)
  return timeStr.replace(/L$/, '');
}

/**
 * Build delivery info part for subject line
 */
function buildDeliveryInfoPart(airportCode?: string, deliveryDate?: string, deliveryTime?: string): string {
  const parts: string[] = [];
  
  if (airportCode) {
    parts.push(airportCode);
  }
  
  const formattedDate = formatDateForSubject(deliveryDate);
  const formattedTime = formatTimeForSubject(deliveryTime);
  
  if (formattedDate && formattedTime) {
    parts.push(`${formattedDate} ${formattedTime}`);
  } else if (formattedDate) {
    parts.push(formattedDate);
  } else if (formattedTime) {
    parts.push(formattedTime);
  }
  
  return parts.length > 0 ? ` / ${parts.join(' / ')}` : '';
}

/**
 * Get email subject based on recipient and purpose
 */
export function getEmailSubject(
  orderNumber: string, 
  recipient: EmailRecipient, 
  purpose: EmailPurpose, 
  airportCode?: string, 
  status?: string,
  deliveryDate?: string,
  deliveryTime?: string
): string {
  const displayNum = orderNumber;
  const deliveryPart = buildDeliveryInfoPart(airportCode, deliveryDate, deliveryTime);
  
  if (recipient === 'caterer') {
    // Special handling for awaiting_caterer status
    if (status === 'awaiting_caterer') {
      return `Kabin247 Order#${displayNum}${deliveryPart} / Confirmation Request`;
    }
    
    switch (purpose) {
      case 'quote_request':
        return `Kabin247 Order#${displayNum}${deliveryPart} / Quote Request- This Order Is Not Live!`;
      case 'order_request':
      case 'confirmation':
        return `Kabin247 Order Request#${displayNum}${deliveryPart}`;
      case 'cancellation':
        return `Kabin247 Cancellation#${displayNum}${deliveryPart}`;
      case 'update':
      default:
        return `Kabin247 Order Update#${displayNum}${deliveryPart}`;
    }
  }
  
  // Client emails
  // Special handling for awaiting_client_approval status
  if (status === 'awaiting_client_approval') {
    return `Kabin247 Order#${displayNum}${deliveryPart} / Order Estimate - This Order Is Not Live`;
  }
  
  // Special handling for caterer_confirmed status
  if (status === 'caterer_confirmed') {
    return `Kabin247 Order#${displayNum}${deliveryPart} / Order Confirmed`;
  }
  
  // Special handling for delivered status
  if (status === 'delivered') {
    return `Kabin247 Order#${displayNum}${deliveryPart} / Delivery Completed`;
  }
  
  // Special handling for paid status
  if (status === 'paid') {
    return `Kabin247 Ord#${displayNum}${deliveryPart} Final Invoice`;
  }
  
  switch (purpose) {
    case 'quote':
      return `Kabin247 Quote#${displayNum}${deliveryPart}`;
    case 'confirmation':
      return `Kabin247 Conf#${displayNum}${deliveryPart}`;
    case 'delivery':
      return `Kabin247 Delivery Update#${displayNum}${deliveryPart}`;
    case 'invoice':
      return `Kabin247 Invoice#${displayNum}${deliveryPart}`;
    case 'update':
      return `Kabin247 Order Update#${displayNum}${deliveryPart}`;
    case 'cancellation':
      return `Kabin247 Cancellation#${displayNum}${deliveryPart}`;
    default:
      return `Kabin247 Order#${displayNum}${deliveryPart}`;
  }
}

/**
 * Determine email purpose from order status
 */
export function getEmailPurposeFromStatus(status: string, recipient: EmailRecipient): EmailPurpose {
  if (recipient === 'caterer') {
    switch (status) {
      case 'awaiting_quote':
      case 'awaiting_caterer':
        return 'quote_request';
      case 'caterer_confirmed':
        return 'order_request';
      case 'cancelled':
        return 'cancellation';
      case 'order_changed':
        return 'update';
      default:
        return 'update';
    }
  }
  
  // Client
  switch (status) {
    case 'awaiting_quote':
    case 'awaiting_client_approval':
      return 'quote';
    case 'caterer_confirmed':
    case 'in_preparation':
    case 'ready_for_delivery':
      return 'confirmation';
    case 'delivered':
      return 'delivery';
    case 'paid':
      return 'invoice';
    case 'cancelled':
      return 'cancellation';
    case 'order_changed':
      return 'update';
    default:
      return 'update';
  }
}

// Email templates based on order status and recipient type
// Note: Subject is now generated via getEmailSubject() for consistency
export const EMAIL_TEMPLATES = {
  // Client notifications
  client: {
    awaiting_quote: {
      purpose: 'quote' as EmailPurpose,
      pdfFormat: 'A' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Thank you for considering us to manage your order. Please find order estimate attached.

Kindly advise if we may confirm this request?

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    awaiting_client_approval: {
      purpose: 'quote' as EmailPurpose,
      pdfFormat: 'A' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Please find detailed quote attached.

Kindly advise if we may confirm this request?

Blue Skies,

The Kabin247 Concierge Team!
      `.trim(),
    },
    in_preparation: {
      purpose: 'confirmation' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Thank you for allowing us to manage your inflight provisioning request. Your order/and or update has been confirmed.

Kindly review the attached confirmation and advise if any discrepancies.
Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    ready_for_delivery: {
      purpose: 'confirmation' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Thank you for allowing us to manage your inflight provisioning request. Your order/and or update has been confirmed.

Kindly review the attached confirmation and advise if any discrepancies.
Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    delivered: {
      purpose: 'delivery' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat, // PDF B (no pricing, client info) for delivered orders
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Your order has been delivered.

Thank you for allowing us to manage your inflight request. We look forward to working with you again soon.

Here if you have any questions.

Blue Skies,

The Kabin247 Concierge Team!
      `.trim(),
    },
    paid: {
      purpose: 'invoice' as EmailPurpose,
      pdfFormat: 'A' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Please find detailed invoice attached.

Your continued support is very much appreciated. Here if you have any questions.

Blue Skies,

The Kabin247 Concierge Team!
      `.trim(),
    },
    cancelled: {
      purpose: 'cancellation' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Thank you for allowing us to manage your inflight provisioning request. Your order has been cancelled.

We look forward to working with you again soon.
Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    order_changed: {
      purpose: 'update' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Your order has been updated. Please find the attached updated order details.

Kindly review and advise if any discrepancies.
Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    caterer_confirmed: {
      purpose: 'confirmation' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Your order and/or update has been confirmed. Please find detailed confirmation attached.

Here if you have any questions.

Blue Skies,

The Kabin247 Concierge Team!
      `.trim(),
    },
    // Special purpose templates
    invoice: {
      purpose: 'invoice' as EmailPurpose,
      pdfFormat: 'A' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Please find attached the invoice for your recent order.

Kindly submit payment for the above invoice at your earliest convenience.
Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    // Default template for any other status
    default: {
      purpose: 'update' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Thank you for allowing us to manage your inflight provisioning request. Please find the attached order details.

Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
  },

  // Caterer/Vendor notifications (always PDF B - no pricing)
  caterer: {
    awaiting_quote: {
      purpose: 'quote_request' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: () => `
Dear Team,

Kindly asking your estimate for the attached order. Our client would love to review for approval and confirmation.

Please send at your earliest convenience.

Kind regards,

The Kabin247 Concierge Team!
      `.trim(),
    },
    awaiting_caterer: {
      purpose: 'quote_request' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: () => `
Dear Team,

Please find order details attached.

We look forward to your confirmation.

Kind regards,

The Kabin247 Concierge Team!
      `.trim(),
    },
    caterer_confirmed: {
      purpose: 'order_request' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: () => `
Dear Team,

Thank you for confirming the order. Please proceed with preparation as per the attached details.

Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    in_preparation: {
      purpose: 'update' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: () => `
Dear Team,

Kindly review the attached request for details of the changes requested.
Items Highlighted for your convenience.

Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    cancelled: {
      purpose: 'cancellation' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: () => `
Dear Team,

We would like to cancel this request.
Please advise if cancellation can be confirmed and if any associated charges?

Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    order_changed: {
      purpose: 'update' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: () => `
Dear Team,

There has been an update to the order. Kindly review the attached request for details of the changes.

Items highlighted for your convenience.
Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    awaiting_client_approval: {
      purpose: 'update' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: () => `
Dear Team,

The quote for this order has been sent to the client for approval. We will notify you once approval is received.

Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    // Default template for any other status
    default: {
      purpose: 'update' as EmailPurpose,
      pdfFormat: 'B' as PDFFormat,
      body: () => `
Dear Team,

Kindly review the attached request for details.

Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
  },
};

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private dkimOptions: any = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USERNAME;
    const pass = process.env.SMTP_PASSWORD;

    if (!host || !user || !pass) {
      Logger.warn('SMTP not fully configured', {
        host: !!host,
        user: !!user,
        pass: !!pass,
      });
      return;
    }

    // Load DKIM private key if enabled
    if (process.env.DKIM_ENABLED === 'true') {
      const dkimKeyPath = process.env.DKIM_PRIVATE_KEY_PATH;
      if (dkimKeyPath) {
        try {
          // Resolve path relative to project root
          const absolutePath = path.isAbsolute(dkimKeyPath) 
            ? dkimKeyPath 
            : path.join(process.cwd(), dkimKeyPath);
          
          const privateKey = fs.readFileSync(absolutePath, 'utf8');
          this.dkimOptions = {
            domainName: process.env.DKIM_DOMAIN || 'kabin247.com',
            keySelector: process.env.DKIM_SELECTOR || 'default',
            privateKey,
          };
          Logger.info('DKIM signing enabled', {
            domain: this.dkimOptions.domainName,
            selector: this.dkimOptions.keySelector,
          });
        } catch (error) {
          Logger.error('Failed to load DKIM private key', error);
        }
      }
    }

    const transportOptions: any = {
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    };

    // Add DKIM options if available
    if (this.dkimOptions) {
      transportOptions.dkim = this.dkimOptions;
    }

    this.transporter = nodemailer.createTransport(transportOptions);
    Logger.info('Email transporter initialized', { host, port });
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  async sendEmail(options: EmailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.transporter) {
      return { success: false, error: 'Email service is not configured' };
    }

    try {
      const fromEmail = process.env.SMTP_EMAIL || 'inflight@kabin247.com';
      const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;
      const ccAddresses = options.cc 
        ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc)
        : undefined;

      const mailOptions: nodemailer.SendMailOptions = {
        from: `"Kabin247 Inflight Support" <${fromEmail}>`,
        replyTo: 'inflight@kabin247.com',
        to: toAddresses,
        cc: ccAddresses,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType || 'application/pdf',
        })),
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      Logger.info('Email sent successfully', {
        to: toAddresses,
        cc: ccAddresses || 'none',
        subject: options.subject,
        messageId: result.messageId,
      });

      return { success: true, messageId: result.messageId };
    } catch (error: any) {
      Logger.error('Failed to send email', error, {
        to: options.to,
        subject: options.subject,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the appropriate email template based on recipient type and order status
   */
  getTemplate(
    recipientType: 'client' | 'caterer',
    status: string
  ): { purpose: EmailPurpose; pdfFormat: PDFFormat; body: (name: string) => string } {
    const templates = EMAIL_TEMPLATES[recipientType];
    const template = (templates as any)[status] || templates.default;
    return template;
  }

  /**
   * Get the email subject based on order number, recipient type and purpose
   */
  getSubject(
    orderNumber: string, 
    recipientType: 'client' | 'caterer', 
    purpose: EmailPurpose, 
    airportCode?: string, 
    status?: string,
    deliveryDate?: string,
    deliveryTime?: string
  ): string {
    return getEmailSubject(orderNumber, recipientType, purpose, airportCode, status, deliveryDate, deliveryTime);
  }

  /**
   * Generate HTML email content from plain text body
   */
  generateEmailHTML(body: string, orderNumber: string, includeHeader: boolean = true): string {
    const escapedBody = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kabin247 - ${orderNumber}</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9f9f9;
    }
    .container {
      background-color: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 2px solid #2c3e50;
      margin-bottom: 20px;
    }
    .header h1 {
      color: #2c3e50;
      margin: 0;
      font-size: 24px;
    }
    .header p {
      color: #7f8c8d;
      margin: 5px 0 0 0;
      font-size: 12px;
    }
    .content {
      padding: 20px 0;
    }
    .footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #7f8c8d;
      font-size: 12px;
    }
    .order-ref {
      background-color: #ecf0f1;
      padding: 10px 15px;
      border-radius: 4px;
      margin-bottom: 20px;
      text-align: center;
    }
    .order-ref strong {
      color: #2c3e50;
    }
  </style>
</head>
<body>
  <div class="container">
    ${includeHeader ? `
    <div class="header">
      <h1>KABIN247</h1>
      <p>Inflight Catering Solutions</p>
    </div>
    ` : ''}
    <div class="order-ref">
      <strong>Order Reference: ${orderNumber}</strong>
    </div>
    <div class="content">
      ${escapedBody}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Kabin247. All rights reserved.</p>
      <p>This email was sent regarding order ${orderNumber}</p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Send invite email to employee
   */
  async sendInviteEmail(email: string, inviteLink: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const subject = 'Invitation to Join Kabin247';
    const html = this.generateEmailHTML(`
Dear Team Member,

You have been invited to join the Kabin247 platform.

Please click the link below to create your account:
${inviteLink}

This invitation link will expire in 14 days.

If you did not expect this invitation, please ignore this email.

Best regards,
Kabin247 Team
    `.trim(), 'INVITE', false);

    return this.sendEmail({
      to: email,
      subject,
      html,
    });
  }

  /**
   * Send password reset email with OTP
   */
  async sendPasswordResetEmail(email: string, otp: string, resetLink: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const subject = 'Password Reset - Kabin247';
    const html = this.generateEmailHTML(`
Dear Admin,

You have requested to reset your password for Kabin247.

Your OTP code is: ${otp}

Alternatively, you can use this link to reset your password:
${resetLink}

This code will expire in 10 minutes.

If you did not request a password reset, please ignore this email and ensure your account is secure.

Best regards,
Kabin247 Team
    `.trim(), 'PASSWORD-RESET', false);

    return this.sendEmail({
      to: email,
      subject,
      html,
    });
  }
}

// Singleton instance
let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}