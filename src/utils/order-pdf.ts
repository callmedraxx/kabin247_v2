import PDFDocument from 'pdfkit';

export function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function generateOrderHTML(order: any): string {
  const itemsHTML = (order.items || [])
    .map(
      (item: any) => `
      <tr>
        <td>${escapeHtml(item.item_name)}</td>
        <td>${escapeHtml(item.item_description || '-')}</td>
        <td>${escapeHtml(item.portion_size)}</td>
        <td>$${item.price.toFixed(2)}</td>
      </tr>
    `
    )
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Order ${order.order_number}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
        .section { margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
        .total { font-weight: bold; font-size: 1.2em; margin-top: 20px; }
        .instructions { background-color: #f9f9f9; padding: 10px; border-radius: 5px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Order ${escapeHtml(order.order_number)}</h1>
        <p><strong>Status:</strong> ${escapeHtml(order.status)}</p>
      </div>
      
      <div class="section">
        <h2>Order Details</h2>
        <p><strong>Client:</strong> ${escapeHtml(order.client_name)}</p>
        <p><strong>Caterer:</strong> ${escapeHtml(order.caterer)}</p>
        <p><strong>Airport:</strong> ${escapeHtml(order.airport)}</p>
        ${order.aircraft_tail_number ? `<p><strong>Aircraft Tail Number:</strong> ${escapeHtml(order.aircraft_tail_number)}</p>` : ''}
        <p><strong>Delivery Date:</strong> ${escapeHtml(order.delivery_date)}</p>
        <p><strong>Delivery Time:</strong> ${escapeHtml(order.delivery_time)}</p>
        <p><strong>Priority:</strong> ${escapeHtml(order.order_priority)}</p>
        <p><strong>Payment Method:</strong> ${escapeHtml(order.payment_method)}</p>
      </div>

      ${order.description ? `<div class="section"><h2>Description</h2><p>${escapeHtml(order.description)}</p></div>` : ''}
      ${order.notes ? `<div class="section"><h2>Notes</h2><p>${escapeHtml(order.notes)}</p></div>` : ''}

      <div class="section">
        <h2>Items</h2>
        <table>
          <thead>
            <tr>
              <th>Item Name</th>
              <th>Description</th>
              <th>Portion Size</th>
              <th>Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
      </div>

      <div class="section">
        <p><strong>Subtotal:</strong> $${order.subtotal.toFixed(2)}</p>
        <p><strong>Service Charge:</strong> $${order.service_charge.toFixed(2)}</p>
        <p class="total"><strong>Total:</strong> $${order.total.toFixed(2)}</p>
      </div>

      ${order.reheating_instructions || order.packaging_instructions || order.dietary_restrictions ? `
      <div class="section instructions">
        <h2>Special Instructions</h2>
        ${order.reheating_instructions ? `<p><strong>Reheating Instructions:</strong> ${escapeHtml(order.reheating_instructions)}</p>` : ''}
        ${order.packaging_instructions ? `<p><strong>Packaging Instructions:</strong> ${escapeHtml(order.packaging_instructions)}</p>` : ''}
        ${order.dietary_restrictions ? `<p><strong>Dietary Restrictions:</strong> ${escapeHtml(order.dietary_restrictions)}</p>` : ''}
      </div>
      ` : ''}
    </body>
    </html>
  `;
}

export function generateOrderPDF(order: any): PDFDocument {
  const doc = new PDFDocument({ margin: 50 });

  // Header
  doc.fontSize(20).text(`Order ${order.order_number}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Status: ${order.status}`, { align: 'center' });
  doc.moveDown(2);

  // Order Details
  doc.fontSize(14).text('Order Details', { underline: true });
  doc.moveDown();
  doc.fontSize(10);
  doc.text(`Client: ${order.client_name}`);
  doc.text(`Caterer: ${order.caterer}`);
  doc.text(`Airport: ${order.airport}`);
  if (order.aircraft_tail_number) {
    doc.text(`Aircraft Tail Number: ${order.aircraft_tail_number}`);
  }
  doc.text(`Delivery Date: ${order.delivery_date}`);
  doc.text(`Delivery Time: ${order.delivery_time}`);
  doc.text(`Priority: ${order.order_priority}`);
  doc.text(`Payment Method: ${order.payment_method}`);
  doc.moveDown();

  if (order.description) {
    doc.fontSize(12).text('Description', { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(order.description);
    doc.moveDown();
  }

  if (order.notes) {
    doc.fontSize(12).text('Notes', { underline: true });
    doc.moveDown();
    doc.fontSize(10).text(order.notes);
    doc.moveDown();
  }

  // Items
  doc.fontSize(14).text('Items', { underline: true });
  doc.moveDown();
  
  const tableTop = doc.y;
  const itemHeight = 20;
  let currentY = tableTop;

  // Table header
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Item Name', 50, currentY);
  doc.text('Description', 200, currentY);
  doc.text('Portion', 350, currentY);
  doc.text('Price', 450, currentY, { width: 100, align: 'right' });
  currentY += itemHeight;

  // Table rows
  doc.font('Helvetica');
  (order.items || []).forEach((item: any) => {
    doc.text(item.item_name || '-', 50, currentY, { width: 140 });
    doc.text(item.item_description || '-', 200, currentY, { width: 140 });
    doc.text(item.portion_size || '-', 350, currentY, { width: 90 });
    doc.text(`$${item.price.toFixed(2)}`, 450, currentY, { width: 100, align: 'right' });
    currentY += itemHeight;
  });

  doc.moveDown(2);

  // Totals
  doc.fontSize(12);
  doc.text(`Subtotal: $${order.subtotal.toFixed(2)}`, { align: 'right' });
  doc.text(`Service Charge: $${order.service_charge.toFixed(2)}`, { align: 'right' });
  doc.fontSize(14).font('Helvetica-Bold');
  doc.text(`Total: $${order.total.toFixed(2)}`, { align: 'right' });
  doc.moveDown();

  // Special Instructions
  if (order.reheating_instructions || order.packaging_instructions || order.dietary_restrictions) {
    doc.fontSize(12).font('Helvetica-Bold').text('Special Instructions', { underline: true });
    doc.moveDown();
    doc.fontSize(10).font('Helvetica');
    if (order.reheating_instructions) {
      doc.text(`Reheating Instructions: ${order.reheating_instructions}`);
    }
    if (order.packaging_instructions) {
      doc.text(`Packaging Instructions: ${order.packaging_instructions}`);
    }
    if (order.dietary_restrictions) {
      doc.text(`Dietary Restrictions: ${order.dietary_restrictions}`);
    }
  }

  return doc;
}

export async function generateOrderPDFBuffer(order: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = generateOrderPDF(order);
    const chunks: Buffer[] = [];
    
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    doc.end();
  });
}

export function generateOrderEmailHTML(order: any, customMessage?: string): string {
  const itemsHTML = (order.items || [])
    .map(
      (item: any) => `
      <tr>
        <td>${escapeHtml(item.item_name)}</td>
        <td>${escapeHtml(item.item_description || '-')}</td>
        <td>${escapeHtml(item.portion_size)}</td>
        <td>$${item.price.toFixed(2)}</td>
      </tr>
    `
    )
    .join('');

  return `
    <html>
    <body style="font-family: Arial, sans-serif; margin: 20px;">
      ${customMessage ? `<p>${escapeHtml(customMessage)}</p>` : ''}
      <h2>Order ${escapeHtml(order.order_number)}</h2>
      <p><strong>Client:</strong> ${escapeHtml(order.client_name)}</p>
      <p><strong>Delivery Date:</strong> ${escapeHtml(order.delivery_date)} at ${escapeHtml(order.delivery_time)}</p>
      <p><strong>Airport:</strong> ${escapeHtml(order.airport)}</p>
      
      <h3>Items</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="padding: 8px; border: 1px solid #ddd;">Item Name</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Description</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Portion Size</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>
      
      <p><strong>Total: $${order.total.toFixed(2)}</strong></p>
    </body>
    </html>
  `;
}
