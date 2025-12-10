import nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

export type EmailRecipient = 'client' | 'caterer' | 'both';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}

// Email templates based on order status and recipient type
export const EMAIL_TEMPLATES = {
  // Client notifications
  client: {
    awaiting_quote: {
      subject: (orderNumber: string) => `Order Estimate - ${orderNumber}`,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Thank you for considering us to manage your order. Please find order estimate attached.

Kindly advise if we may confirm this request?

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    quote_sent: {
      subject: (orderNumber: string) => `Order Estimate - ${orderNumber}`,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Thank you for considering us to manage your order. Please find order estimate attached.

Kindly advise if we may confirm this request?

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    quote_approved: {
      subject: (orderNumber: string) => `Order Confirmation - ${orderNumber}`,
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
    in_preparation: {
      subject: (orderNumber: string) => `Order Confirmation - ${orderNumber}`,
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
      subject: (orderNumber: string) => `Order Confirmation - ${orderNumber}`,
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
      subject: (orderNumber: string) => `Delivery Notification - ${orderNumber}`,
      body: (clientFirstName: string) => `
Dear ${clientFirstName},

Thank you for allowing us to manage your inflight provisioning request. Your order has been delivered.

We look forward to working with you again soon.
Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    cancelled: {
      subject: (orderNumber: string) => `Order Cancelled - ${orderNumber}`,
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
    // Default template for any other status
    default: {
      subject: (orderNumber: string) => `Order Update - ${orderNumber}`,
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

  // Caterer/Vendor notifications
  caterer: {
    awaiting_quote: {
      subject: (orderNumber: string) => `New Order Request - ${orderNumber}`,
      body: () => `
Dear Team,

Thank you for considering our order. Kindly advise if able to accommodate the attached request?

Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    awaiting_caterer: {
      subject: (orderNumber: string) => `New Order Request - ${orderNumber}`,
      body: () => `
Dear Team,

Thank you for considering our order. Kindly advise if able to accommodate the attached request?

Here if you have any questions.

Sincerely,
Kabin247 Inflight Support
One point of contact for your global inflight needs.
      `.trim(),
    },
    quote_sent: {
      subject: (orderNumber: string) => `Order Update - ${orderNumber}`,
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
    quote_approved: {
      subject: (orderNumber: string) => `Order Confirmed - ${orderNumber}`,
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
    in_preparation: {
      subject: (orderNumber: string) => `Order Update - ${orderNumber}`,
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
      subject: (orderNumber: string) => `Order Cancellation - ${orderNumber}`,
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
    // Default template for any other status
    default: {
      subject: (orderNumber: string) => `Order Update - ${orderNumber}`,
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
      const fromEmail = process.env.SMTP_EMAIL || 'noreply@kabin247.com';
      const toAddresses = Array.isArray(options.to) ? options.to.join(', ') : options.to;

      const mailOptions: nodemailer.SendMailOptions = {
        from: `"Kabin247 Inflight Support" <${fromEmail}>`,
        to: toAddresses,
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
  ): { subject: (orderNumber: string) => string; body: (name: string) => string } {
    const templates = EMAIL_TEMPLATES[recipientType];
    const template = (templates as any)[status] || templates.default;
    return template;
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
}

// Singleton instance
let emailServiceInstance: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}

