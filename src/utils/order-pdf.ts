import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import puppeteer from 'puppeteer';
import { defaultPDFStyles, statusColors, statusBackgrounds, statusLabels, PDFStyleConfig } from './pdf-styles';

// Try multiple paths for logo (works in both dev and production)
function getLogoPath(): string | null {
  const possiblePaths = [
    path.join(__dirname, '..', 'assets', 'logo.png'),           // Dev: src/utils -> src/assets
    path.join(__dirname, '..', '..', 'src', 'assets', 'logo.png'), // Prod: dist/utils -> src/assets
    path.join(process.cwd(), 'src', 'assets', 'logo.png'),      // From project root
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Convert logo file to base64 data URI for use in HTML
 */
function getLogoDataUri(): string | null {
  const logoPath = getLogoPath();
  if (!logoPath) return null;
  try {
    const logoBuffer = fs.readFileSync(logoPath);
    const base64 = logoBuffer.toString('base64');
    return `data:image/png;base64,${base64}`;
  } catch (e) {
    return null;
  }
}

/**
 * Get Chrome/Chromium executable path for Puppeteer
 */
function getChromeExecutablePath(): string | undefined {
  // Try Puppeteer's bundled Chrome path (most common location)
  const puppeteerChromePath = '/root/.cache/puppeteer/chrome/linux-143.0.7499.169/chrome-linux64/chrome';
  if (fs.existsSync(puppeteerChromePath)) {
    return puppeteerChromePath;
  }
  
  // Try alternative Puppeteer cache locations
  const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
  const altPaths = [
    `${homeDir}/.cache/puppeteer/chrome/linux-143.0.7499.169/chrome-linux64/chrome`,
    `${homeDir}/.local/share/puppeteer/chrome/linux-143.0.7499.169/chrome-linux64/chrome`
  ];
  
  for (const altPath of altPaths) {
    if (fs.existsSync(altPath)) {
      return altPath;
    }
  }
  
  // Fallback to system Chromium
  const systemChromiumPaths = [
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium'
  ];
  
  for (const chromiumPath of systemChromiumPaths) {
    if (fs.existsSync(chromiumPath)) {
      return chromiumPath;
    }
  }
  
  return undefined;
}

/**
 * Decode HTML entities (e.g., &#206; -> Î, &#237; -> í)
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  // Decode numeric entities like &#206; or &#237;
  return text.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(parseInt(dec, 10));
  }).replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  }).replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Common named entities
    .replace(/&apos;/g, "'")
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™');
}

/**
 * Escape HTML special characters for safe display
 * First decodes HTML entities, then escapes for safe HTML output
 */
export function escapeHtml(text: string): string {
  if (!text) return '';
  // First decode any existing HTML entities, then escape for safe HTML
  const decoded = decodeHtmlEntities(text);
  return decoded.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

/**
 * Decode HTML entities for plain text (used in PDF where we don't need HTML escaping)
 */
export function decodeHtmlEntitiesForText(text: string): string {
  return decodeHtmlEntities(text);
}

function formatPrice(value: any): string {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return num.toFixed(2);
}

function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  
  // If it's already a Date object, use UTC methods directly
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) return '';
    return `${String(dateInput.getUTCMonth() + 1).padStart(2, '0')}/${String(dateInput.getUTCDate()).padStart(2, '0')}/${String(dateInput.getUTCFullYear()).slice(-2)}`;
  }
  
  // Convert to string if needed
  const dateStr = String(dateInput);
  
  // If it's in YYYY-MM-DD format, parse it directly to avoid timezone issues
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${month}/${day}/${year.slice(-2)}`;
  }
  
  // Fallback: parse as date but use UTC methods to avoid timezone conversion
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCFullYear()).slice(-2)}`;
}

function formatTime(timeStr: string): string {
  return timeStr ? `${timeStr}L` : '';
}

function getStatusLabel(status: string): string {
  return statusLabels[status] || status.toUpperCase().replace(/_/g, ' ');
}

function getDisplayOrderNumber(order: any): string {
  // Use order number directly without order type prefix
  return order.order_number || '';
}

function getLogoBase64(): string {
  try {
    const logoPath = getLogoPath();
    if (logoPath) return fs.readFileSync(logoPath).toString('base64');
  } catch (e) {}
  return '';
}

export function generateOrderHTML(order: any): string {
  const s = defaultPDFStyles;
  const c = s.colors;
  const displayNum = getDisplayOrderNumber(order);
  const statusLabel = getStatusLabel(order.status);
  const statusColor = statusColors[order.status] || c.secondary;
  const statusBg = statusBackgrounds[order.status] || c.background;
  
  const clientName = decodeHtmlEntitiesForText(order.client?.full_name || order.client_name || '');
  const clientCompany = decodeHtmlEntitiesForText(order.client?.company_name || '');
  const clientAddr = decodeHtmlEntitiesForText(order.client?.full_address || '');
  const clientEmail = decodeHtmlEntitiesForText(order.client?.email || '');
  const clientPhone = decodeHtmlEntitiesForText(order.client?.contact_number || '');
  // Use airport_details codes if available, otherwise fall back to order.airport field (which may contain code or name)
  const airportCode = decodeHtmlEntitiesForText(
    order.airport_details?.airport_code_iata || 
    order.airport_details?.airport_code_icao || 
    (order.airport && order.airport.length <= 10 ? order.airport : '') || // Use airport field if it looks like a code (short)
    ''
  );
  const airportName = decodeHtmlEntitiesForText(order.airport_details?.airport_name || order.airport || '');
  const fboName = decodeHtmlEntitiesForText(order.fbo?.fbo_name || '');
  const dietary = decodeHtmlEntitiesForText(order.dietary_restrictions || '');
  
  const itemsHTML = (order.items || []).map((item: any, i: number) => {
    // Pale blue shading for alternating rows, or clean black line
    const bg = i % 2 === 0 ? '#fff' : '#f0f9ff';
    const borderColor = i % 2 === 0 ? '#e5e7eb' : '#e5e7eb';
    // Preserve newlines in description by converting to <br/> tags
    const descText = item.item_description ? escapeHtml(item.item_description).replace(/\n/g, '<br/>') : '';
    const desc = descText ? `<div style="font-family:'Times New Roman',Times,serif;font-size:13px;color:${c.textLight};margin-top:4px;line-height:1.4">${descText}</div>` : '';
    const packagingTag = item.packaging ? `<div style="font-family:'Times New Roman',Times,serif;font-size:13px;font-weight:bold;color:#0369a1;margin-top:4px">${escapeHtml(item.packaging)}</div>` : '';
    const qty = parseFloat(item.portion_size) || 1;
    return `<tr style="background:${bg}">
      <td style="padding:8px 16px;border-bottom:1px solid ${borderColor};width:54%">
        <div style="font-family:'Times New Roman',Times,serif;font-size:16px;font-weight:600;color:${c.primary}">${escapeHtml(item.item_name)}</div>
        ${desc}
        ${packagingTag}
      </td>
      <td style="padding:8px 6px;text-align:center;border-bottom:1px solid ${borderColor};width:10%;font-family:'Times New Roman',Times,serif;font-size:12px">${escapeHtml(item.portion_size)}</td>
      <td style="padding:8px 6px;text-align:right;border-bottom:1px solid ${borderColor};width:18%;font-family:'Times New Roman',Times,serif;font-size:12px;color:${c.textLight}">$${formatPrice(item.price/qty)}</td>
      <td style="padding:8px 6px;text-align:right;border-bottom:1px solid ${borderColor};width:18%;font-family:'Times New Roman',Times,serif;font-size:12px;font-weight:600">$${formatPrice(item.price)}</td>
    </tr>`;
  }).join('');

  // Use URL for logo so frontend can fetch it (logoUrl can be overridden via order._logoUrl)
  const logoUrl = order._logoUrl || '/assets/logo.png';
  const logoImg = `<img src="${escapeHtml(logoUrl)}" style="height:200px;margin-bottom:12px" alt="${escapeHtml(s.company.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/><div style="display:none;font-size:24px;font-weight:700;color:${c.primary};margin-bottom:12px">${escapeHtml(s.company.name)}</div>`;

  // Add PAID stamp if status is paid
  const paidStamp = order.status === 'paid' ? `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-45deg);font-size:120px;font-weight:900;color:rgba(16,185,129,0.15);z-index:1000;pointer-events:none;font-family:'Times New Roman',Times,serif;letter-spacing:20px">PAID</div>` : '';

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice #${displayNum}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f1f5f9;padding:20px;color:${c.text}}.inv{max-width:800px;margin:0 auto;background:#fff;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);border-radius:12px;overflow:hidden}.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:32px 40px;border-bottom:1px solid ${c.borderLight}}.co-info{font-size:12px;color:${c.textLight};line-height:1.5}.inv-num{font-size:24px;font-weight:700;color:${c.primary};margin-bottom:4px}.inv-sub{font-size:13px;color:${c.textLight};text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}.badge{display:inline-block;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;background:${statusBg};color:${statusColor}}.det{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:32px 40px;background:${c.background}}.det h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${c.textMuted};margin-bottom:16px;font-weight:600}.det-row{display:flex;margin-bottom:10px;font-size:13px}.det-lbl{width:100px;color:${c.textLight}}.det-val{font-weight:500}.bt-name{font-size:16px;font-weight:600;margin-bottom:8px}.bt-co{font-size:13px;color:${c.primary};font-weight:500;margin-bottom:8px}.bt-det{font-size:12px;color:${c.textLight};line-height:1.6}.items{padding:32px 40px}table{width:100%;border-collapse:separate;border-spacing:0;border-radius:8px;overflow:hidden;border:1px solid ${c.border}}thead th{background:${c.primaryDark};color:#fff;padding:10px 16px;font-family:'Times New Roman',Times,serif;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;text-align:left}thead th:nth-child(2),thead th:nth-child(3){text-align:center}thead th:last-child{text-align:right}.tots{padding:0 40px 32px;display:flex;justify-content:flex-end}.tots-box{width:280px;background:${c.background};border-radius:8px;padding:20px;border:1px solid ${c.borderLight}}.tot-row{display:flex;justify-content:space-between;padding:8px 0;font-size:13px;color:${c.textLight}}.tot-row.grand{border-top:2px solid ${c.border};margin-top:8px;padding-top:16px;font-size:16px;font-weight:700;color:${c.primary}}.ftr{padding:32px 40px;background:${c.background};border-top:1px solid ${c.borderLight};text-align:center}.ftr-msg{font-size:13px;color:${c.textLight};line-height:1.8;margin-bottom:16px}.ftr-sig{font-size:14px;font-weight:600;color:${c.primary};margin-bottom:8px}.ftr-tag{font-size:12px;color:${c.textMuted};font-style:italic}.inst{padding:0 40px 32px}.inst-box{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:20px}.inst-box h4{color:#b45309;font-size:13px;font-weight:600;margin-bottom:12px}.inst-item{font-size:12px;color:#78350f;margin-bottom:8px}</style></head>
<body><div class="inv">
<div class="hdr"><div>${logoImg}<div class="co-info">${escapeHtml(s.company.address)}<br/><b>Phone | ${escapeHtml(s.company.phone)}</b></div></div><div style="text-align:right"><div class="inv-num">INVOICE #${escapeHtml(displayNum)}</div><div class="inv-sub">Inflight Catering Order</div><span class="badge">${escapeHtml(statusLabel)}</span></div></div>
<div class="det"><div><h3>Bill To</h3><div class="bt-name">${escapeHtml(clientName)}</div>${clientCompany ? `<div class="bt-co">${escapeHtml(clientCompany)}</div>` : ''}<div class="bt-det" style="word-wrap:break-word;overflow-wrap:break-word;max-width:250px">${clientAddr?escapeHtml(clientAddr).replace(/\n/g, '<br/>')+'<br/>':''}${clientEmail?escapeHtml(clientEmail)+'<br/>':''}${clientPhone?escapeHtml(clientPhone):''}</div></div><div><h3>Delivery Details</h3><div class="det-row"><span class="det-lbl">Date & Time:</span><span class="det-val">${escapeHtml(formatDate(order.delivery_date))} &nbsp; ${escapeHtml(formatTime(order.delivery_time))}</span></div><div class="det-row"><span class="det-lbl">Airport Code:</span><span class="det-val">${escapeHtml(airportCode)}</span></div><div class="det-row"><span class="det-lbl">FBO:</span><span class="det-val">${escapeHtml(fboName)}</span></div><div class="det-row"><span class="det-lbl">Tail#:</span><span class="det-val">${escapeHtml(order.aircraft_tail_number||'')}</span></div>${dietary?`<div class="det-row"><span class="det-lbl">Dietary:</span><span class="det-val">${escapeHtml(dietary)}</span></div>`:''}</div></div>
${(order.reheating_instructions||order.packaging_instructions)?`<div class="inst"><div class="inst-box"><h4>⚠️ Special Instructions</h4>${order.reheating_instructions?`<div class="inst-item"><b>Reheating:</b> ${escapeHtml(order.reheating_instructions)}</div>`:''}${order.packaging_instructions?`<div class="inst-item"><b>Packaging:</b> ${escapeHtml(order.packaging_instructions)}</div>`:''}</div></div>`:''}
<div class="items"><table><thead><tr><th style="font-size:12px">Item & Description</th><th style="text-align:center;font-size:10px">Qty</th><th style="text-align:right;font-size:10px">Unit Cost</th><th style="text-align:right;font-size:10px">Total</th></tr></thead><tbody>${itemsHTML}</tbody></table></div>
<div class="tots"><div class="tots-box"><div class="tot-row"><span>Subtotal:</span><span>$${formatPrice(order.subtotal)}</span></div>${parseFloat(order.delivery_fee || 0)>0?`<div class="tot-row"><span>${escapeHtml(airportCode)} Delivery Fee:</span><span>$${formatPrice(order.delivery_fee)}</span></div>`:''}${parseFloat(order.service_charge || 0)>0?`<div class="tot-row"><span>Service Charge:</span><span>$${formatPrice(order.service_charge)}</span></div>`:''}${parseFloat(order.coordination_fee || 0)>0?`<div class="tot-row"><span>Coordination Fee:</span><span>$${formatPrice(order.coordination_fee)}</span></div>`:''}${parseFloat(order.airport_fee || 0)>0?`<div class="tot-row"><span>Airport Fee:</span><span>$${formatPrice(order.airport_fee)}</span></div>`:''}${parseFloat(order.fbo_fee || 0)>0?`<div class="tot-row"><span>FBO Fee:</span><span>$${formatPrice(order.fbo_fee)}</span></div>`:''}${parseFloat(order.shopping_fee || 0)>0?`<div class="tot-row"><span>Shopping Fee:</span><span>$${formatPrice(order.shopping_fee)}</span></div>`:''}${parseFloat(order.restaurant_pickup_fee || 0)>0?`<div class="tot-row"><span>Restaurant Pickup Fee:</span><span>$${formatPrice(order.restaurant_pickup_fee)}</span></div>`:''}${parseFloat(order.airport_pickup_fee || 0)>0?`<div class="tot-row"><span>Airport Pickup Fee:</span><span>$${formatPrice(order.airport_pickup_fee)}</span></div>`:''}<div class="tot-row grand"><span>Total:</span><span>$${formatPrice(order.total)}</span></div></div></div>
<div class="ftr"><div class="ftr-msg">Email: Inflight@Kabin247.com &nbsp;&nbsp;&nbsp; Phone: +1-813-331-5667 &nbsp; Address: 4520 W. Oakellar Ave, Unit 13061, Tampa, FL 33611</div></div>
${paidStamp}</div></body></html>`;
}

export function generateOrderPDF(order: any, styles: PDFStyleConfig = defaultPDFStyles): typeof PDFDocument.prototype {
  const c = styles.colors;
  const displayNum = getDisplayOrderNumber(order);
  const statusLabel = getStatusLabel(order.status);
  const statusColor = statusColors[order.status] || c.secondary;

  const doc = new PDFDocument({ margin: styles.spacing.margin, size: styles.layout.pageSize, info: { Title: `Invoice ${displayNum}`, Author: styles.company.name, Subject: 'Inflight Catering Order' }});

  const pw = styles.layout.pageWidth;
  const m = styles.spacing.margin;
  const cw = styles.layout.contentWidth;

  const clientName = decodeHtmlEntitiesForText(order.client?.full_name || order.client_name || '');
  const clientCompany = decodeHtmlEntitiesForText(order.client?.company_name || '');
  const clientAddr = decodeHtmlEntitiesForText(order.client?.full_address || '');
  const clientEmail = decodeHtmlEntitiesForText(order.client?.email || '');
  const clientPhone = decodeHtmlEntitiesForText(order.client?.contact_number || '');
  // Use airport_details codes if available, otherwise fall back to order.airport field (which may contain code or name)
  const airportCode = decodeHtmlEntitiesForText(
    order.airport_details?.airport_code_iata || 
    order.airport_details?.airport_code_icao || 
    (order.airport && order.airport.length <= 10 ? order.airport : '') || // Use airport field if it looks like a code (short)
    ''
  );
  const airportName = decodeHtmlEntitiesForText(order.airport_details?.airport_name || order.airport || '');
  const fboName = decodeHtmlEntitiesForText(order.fbo?.fbo_name || '');
  const dietary = decodeHtmlEntitiesForText(order.dietary_restrictions || '');

  let y = m;

  // HEADER - Logo (aligned with invoice number at top)
  const logoPath = getLogoPath();
  try { if (logoPath) doc.image(logoPath, m, y, { width: 400, height: 168, fit: [400, 168] }); } catch (e) {}

  doc.fillColor(c.primary).fontSize(27).font(styles.fonts.bold).text(`INVOICE #${displayNum}`, m, y, { width: cw, align: 'right' });
  doc.fillColor(c.textLight).fontSize(15).font(styles.fonts.body).text('INFLIGHT CATERING ORDER', m, y + 33, { width: cw, align: 'right' });

  const badgeY = y + 50;
  const badgeW = doc.widthOfString(statusLabel) + 24;
  const badgeX = pw - m - badgeW;
  doc.roundedRect(badgeX, badgeY, badgeW, 22, 11).fillColor(statusColor).fill();
  doc.fillColor(c.white).fontSize(14).font(styles.fonts.bold).text(statusLabel, badgeX, badgeY + 6, { width: badgeW, align: 'center' });

  const coY = y + 175;
  doc.fillColor(c.textLight).fontSize(14).font(styles.fonts.body).text(styles.company.address, m, coY).text(`Phone | ${styles.company.phone}`, m, coY + 18);

  y = coY + 20;
  doc.moveTo(m, y).lineTo(pw - m, y).strokeColor(c.borderLight).lineWidth(1).stroke();
  y += 12;

  // DETAILS - More compact fixed height
  const dh = 110;
  doc.rect(m, y, cw, dh).fillColor(c.background).fill();

  const lx = m + 20, rx = pw / 2 + 20;
  let dy = y + 12;

  doc.fillColor(c.textMuted).fontSize(14).font(styles.fonts.bold).text('BILL TO', lx, dy);
  let by = dy + 20;
  doc.fillColor(c.text).fontSize(20).font(styles.fonts.bold).text(clientName, lx, by);
  by += 22;
  if (clientCompany) {
    doc.fillColor(c.primary).fontSize(17).font(styles.fonts.bold).text(clientCompany, lx, by);
    by += 20;
  }
  doc.fillColor(c.textLight).fontSize(14).font(styles.fonts.body);
  if (clientAddr) { 
    const startY = by;
    doc.text(clientAddr, lx, by, { width: 200, lineBreak: true });
    const endY = doc.y;
    by = endY + 8; // Compact spacing after wrapped address text
  }
  if (clientEmail) { doc.text(clientEmail, lx, by); by += 18; }
  if (clientPhone) { doc.text(clientPhone, lx, by); }

  doc.fillColor(c.textMuted).fontSize(14).font(styles.fonts.bold).text('DELIVERY DETAILS', rx, dy);
  let ry = dy + 20;
  const row = (l: string, v: string, yy: number) => {
    doc.fillColor(c.textLight).fontSize(14).font(styles.fonts.body).text(l, rx, yy);
    doc.fillColor(c.text).font(styles.fonts.bold).text(v, rx + 80, yy);
    return yy + 20;
  };
  ry = row('Date & Time:', `${formatDate(order.delivery_date)}   ${formatTime(order.delivery_time)}`, ry);
  ry = row('Airport Code:', airportCode, ry);
  ry = row('FBO:', fboName, ry);
  ry = row('Tail#:', order.aircraft_tail_number || '', ry);
  if (dietary) row('Dietary:', dietary, ry);

  y += dh + 12;

  // INSTRUCTIONS (moved above items table)
  if (order.reheating_instructions || order.packaging_instructions) {
    const hasReheating = !!order.reheating_instructions;
    const hasPackaging = !!order.packaging_instructions;
    const ih = hasReheating && hasPackaging ? 70 : 55; // More compact height
    doc.roundedRect(m, y, cw, ih, 6).fillColor('#fffbeb').fill();
    doc.roundedRect(m, y, cw, ih, 6).strokeColor('#fcd34d').lineWidth(1).stroke();
    doc.fillColor('#b45309').fontSize(15).font(styles.fonts.bold).text('⚠ Special Instructions', m + 15, y + 12);
    let iy = y + 30;
    doc.fontSize(14).font(styles.fonts.body).fillColor('#78350f');
    if (order.reheating_instructions) { 
      doc.font(styles.fonts.bold).text('Reheating: ', m + 15, iy, { continued: true }); 
      doc.font(styles.fonts.body).text(decodeHtmlEntitiesForText(order.reheating_instructions)); 
      iy += 22; // Compact spacing between instructions
    }
    if (order.packaging_instructions) { 
      doc.font(styles.fonts.bold).text('Packaging: ', m + 15, iy, { continued: true }); 
      doc.font(styles.fonts.body).text(decodeHtmlEntitiesForText(order.packaging_instructions)); 
    }
    y += ih + 12;
  }

  // TABLE
  const tw = cw;
  const cols = { item: tw * 0.54, qty: tw * 0.10, unit: tw * 0.18, total: tw * 0.18 };

  doc.roundedRect(m, y, tw, 40, 4).fillColor(c.primaryDark).fill();
  doc.fillColor(c.white).fontSize(14).font(styles.fonts.bold);
  const hy = y + 13;
  doc.text('Item & Description', m + 12, hy);
  doc.text('Qty', m + cols.item, hy, { width: cols.qty, align: 'center' });
  doc.text('Unit Cost', m + cols.item + cols.qty, hy, { width: cols.unit, align: 'right' });
  doc.text('Total', m + cols.item + cols.qty + cols.unit, hy, { width: cols.total - 12, align: 'right' });
  y += 40;

  (order.items || []).forEach((item: any, i: number) => {
    const hasDesc = item.item_description?.trim();
    const hasTags = item.category || item.packaging;
    const rh = hasDesc && hasTags ? 65 : hasDesc || hasTags ? 52 : 36; // More compact row heights
    doc.rect(m, y, tw, rh).fillColor(i % 2 === 0 ? c.white : c.backgroundAlt).fill();
    doc.moveTo(m, y + rh).lineTo(m + tw, y + rh).strokeColor(c.borderLight).lineWidth(0.5).stroke();

    const ty = y + (hasDesc || hasTags ? 10 : 11);
    doc.fillColor(c.primary).fontSize(16).font(styles.fonts.bold).text(decodeHtmlEntitiesForText(item.item_name || ''), m + 12, ty, { width: cols.item - 20 });
    let descY = ty + 17;
    if (hasDesc) { 
      doc.fillColor(c.textLight).fontSize(12).font(styles.fonts.body).text(decodeHtmlEntitiesForText(item.item_description), m + 12, descY, { width: cols.item - 20 }); 
      descY += 14;
    }
    if (hasTags) {
      let tagX = m + 12;
      if (item.category) {
        doc.fillColor(c.textMuted).fontSize(11).font(styles.fonts.body).text(`[${decodeHtmlEntitiesForText(item.category)}]`, tagX, descY);
        tagX += doc.widthOfString(`[${decodeHtmlEntitiesForText(item.category)}]`) + 6;
      }
      if (item.packaging) {
        doc.fillColor('#0369a1').fontSize(11).font(styles.fonts.body).text(`[${decodeHtmlEntitiesForText(item.packaging)}]`, tagX, descY);
      }
    }
    doc.fillColor(c.text).fontSize(15).font(styles.fonts.body).text(item.portion_size || '', m + cols.item, ty, { width: cols.qty, align: 'center' });
    const qty = parseFloat(item.portion_size) || 1;
    doc.fillColor(c.textLight).text(`$${formatPrice(item.price / qty)}`, m + cols.item + cols.qty, ty, { width: cols.unit, align: 'right' });
    doc.fillColor(c.text).font(styles.fonts.bold).text(`$${formatPrice(item.price)}`, m + cols.item + cols.qty + cols.unit, ty, { width: cols.total - 12, align: 'right' });
    y += rh;
  });

  doc.roundedRect(m, y - 1, tw, 2, 1).fillColor(c.border).fill();
  y += 15;

  // TOTALS
  const totW = 220, totX = pw - m - totW, totH = 90;
  doc.roundedRect(totX, y, totW, totH, 6).fillColor(c.background).fill();
  doc.roundedRect(totX, y, totW, totH, 6).strokeColor(c.borderLight).lineWidth(1).stroke();

  let ty = y + 18;
  doc.fillColor(c.textLight).fontSize(15).font(styles.fonts.body);
  doc.text('Subtotal:', totX + 15, ty).text(`$${formatPrice(order.subtotal)}`, totX + 15, ty, { width: totW - 30, align: 'right' });
  ty += 20;
  if (parseFloat(order.delivery_fee || 0) > 0) { doc.text(`${airportCode} Delivery Fee:`, totX + 15, ty).text(`$${formatPrice(order.delivery_fee)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 20; }
  if (parseFloat(order.service_charge || 0) > 0) { doc.text('Service Charge:', totX + 15, ty).text(`$${formatPrice(order.service_charge)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 20; }
  if (parseFloat(order.coordination_fee || 0) > 0) { doc.text('Coordination Fee:', totX + 15, ty).text(`$${formatPrice(order.coordination_fee)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 20; }
  if (parseFloat(order.airport_fee || 0) > 0) { doc.text('Airport Fee:', totX + 15, ty).text(`$${formatPrice(order.airport_fee)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 20; }
  if (parseFloat(order.fbo_fee || 0) > 0) { doc.text('FBO Fee:', totX + 15, ty).text(`$${formatPrice(order.fbo_fee)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 20; }
  if (parseFloat(order.shopping_fee || 0) > 0) { doc.text('Shopping Fee:', totX + 15, ty).text(`$${formatPrice(order.shopping_fee)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 20; }
  if (parseFloat(order.restaurant_pickup_fee || 0) > 0) { doc.text('Restaurant Pickup Fee:', totX + 15, ty).text(`$${formatPrice(order.restaurant_pickup_fee)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 20; }
  if (parseFloat(order.airport_pickup_fee || 0) > 0) { doc.text('Airport Pickup Fee:', totX + 15, ty).text(`$${formatPrice(order.airport_pickup_fee)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 20; }
  ty += 6;
  doc.moveTo(totX + 15, ty).lineTo(totX + totW - 15, ty).strokeColor(c.border).lineWidth(1.5).stroke();
  ty += 14;
  doc.fillColor(c.primary).fontSize(21).font(styles.fonts.bold);
  doc.text('Total:', totX + 15, ty).text(`$${formatPrice(order.total)}`, totX + 15, ty, { width: totW - 30, align: 'right' });

  y += totH + 20;

  // FOOTER - Company contact details
  const fy = Math.max(y, styles.layout.pageHeight - 50);
  doc.moveTo(m, fy).lineTo(pw - m, fy).strokeColor(c.borderLight).lineWidth(1).stroke();
  doc.fillColor(c.textLight).fontSize(12).font(styles.fonts.body).text('Email: Inflight@Kabin247.com   Phone: +1-813-331-5667  Address: 4520 W. Oakellar Ave, Unit 13061, Tampa, FL 33611', m, fy + 12, { width: cw, align: 'center' });

  // Add PAID stamp if status is paid (diagonal watermark)
  if (order.status === 'paid') {
    const centerX = pw / 2;
    const centerY = styles.layout.pageHeight / 2;
    const stampText = 'PAID';
    const stampSize = 120;
    
    // Save current state
    doc.save();
    
    // Move to center
    doc.translate(centerX, centerY);
    doc.rotate(-45);
    
    // Draw semi-transparent PAID text
    doc.fillColor('#10b981', 0.15); // Green with 15% opacity
    doc.fontSize(stampSize).font(styles.fonts.bold);
    const textWidth = doc.widthOfString(stampText);
    doc.text(stampText, -textWidth / 2, -stampSize / 2, {
      width: textWidth,
      align: 'center'
    });
    
    // Restore state
    doc.restore();
  }

  return doc;
}

export async function generateOrderPDFBuffer(order: any): Promise<Buffer> {
  // Generate HTML
  let html = generateOrderHTML(order);
  
  // Replace logo URL with data URI for PDF generation
  const logoDataUri = getLogoDataUri();
  if (logoDataUri) {
    html = html.replace(/src="[^"]*logo\.png[^"]*"/g, `src="${logoDataUri}"`);
  }
  
  // Convert HTML to PDF using puppeteer
  const chromePath = getChromeExecutablePath();
  const launchOptions: any = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  };
  
  if (chromePath) {
    launchOptions.executablePath = chromePath;
  }
  
  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    return Buffer.from(pdfBuffer);
  } catch (error: any) {
    throw new Error(`Failed to generate PDF: ${error.message}. Chrome path: ${chromePath || 'default'}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Get order type title for PDF B
 */
function getOrderTypeTitle(orderType: string): string {
  if (orderType === 'Inflight order') return 'INFLIGHT CATERING ORDER';
  if (orderType === 'QE Serv Hub Order') return 'QE SERV HUB ORDER';
  if (orderType === 'Restaurant Pickup Order') return 'RESTAURANT PICKUP ORDER';
  return 'CATERING ORDER';
}

/**
 * Group items by category for PDF B
 */
function groupItemsByCategory(items: any[]): Map<string, any[]> {
  const grouped = new Map<string, any[]>();
  
  for (const item of items) {
    const category = item.category || 'UNCATEGORIZED';
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(item);
  }
  
  return grouped;
}

/**
 * Generate HTML preview for PDF B (Vendor PO / Client Confirmation)
 * - No pricing information
 * - Items grouped by category
 * - Shows packaging preferences
 */
export function generateOrderHTMLB(order: any, recipientType: 'client' | 'caterer' = 'caterer'): string {
  const s = defaultPDFStyles;
  const c = s.colors;
  const displayNum = getDisplayOrderNumber(order);
  const orderTypeTitle = getOrderTypeTitle(order.order_type);
  const revisionCount = order.revision_count || 0;
  const statusLabel = getStatusLabel(order.status);
  const statusColor = statusColors[order.status] || c.secondary;
  const statusBg = statusBackgrounds[order.status] || c.background;
  
  // Check if this PDF is for a caterer (when status is awaiting_quote or awaiting_caterer, or explicitly set)
  const isForCaterer = recipientType === 'caterer' || (order.status === 'awaiting_quote' || order.status === 'awaiting_caterer');
  
  // For caterers (awaiting_quote or awaiting_caterer status), use Kabin247 info instead of client info
  const clientName = isForCaterer 
    ? 'Kabin247' 
    : decodeHtmlEntitiesForText(order.client?.full_name || order.client_name || '');
  const clientCompany = isForCaterer 
    ? '' 
    : decodeHtmlEntitiesForText(order.client?.company_name || '');
  const clientAddr = isForCaterer 
    ? decodeHtmlEntitiesForText(s.company.address) 
    : decodeHtmlEntitiesForText(order.client?.full_address || '');
  const clientEmail = isForCaterer 
    ? 'accounting@Kabin247.com' 
    : decodeHtmlEntitiesForText(order.client?.email || '');
  const clientPhone = isForCaterer 
    ? '' 
    : decodeHtmlEntitiesForText(order.client?.contact_number || '');
  // Use airport_details codes if available, otherwise fall back to order.airport field (which may contain code or name)
  const airportCode = decodeHtmlEntitiesForText(
    order.airport_details?.airport_code_iata || 
    order.airport_details?.airport_code_icao || 
    (order.airport && order.airport.length <= 10 ? order.airport : '') || // Use airport field if it looks like a code (short)
    ''
  );
  const fboName = decodeHtmlEntitiesForText(order.fbo?.fbo_name || '');
  const dietary = decodeHtmlEntitiesForText(order.dietary_restrictions || '');
  const packagingInst = decodeHtmlEntitiesForText(order.packaging_instructions || '');
  
  // Generate items HTML (no category grouping)
  const itemsHTML = (order.items || []).map((item: any, i: number) => {
    // Pale blue shading for alternating rows, or clean black line
    const bg = i % 2 === 0 ? '#fff' : '#f0f9ff';
    const borderColor = i % 2 === 0 ? '#e5e7eb' : '#e5e7eb';
    // Preserve newlines in description by converting to <br/> tags
    const descText = item.item_description ? escapeHtml(item.item_description).replace(/\n/g, '<br/>') : '';
    const desc = descText ? `<div style="font-family:'Times New Roman',Times,serif;font-size:14px;color:${c.textLight};margin-top:4px;line-height:1.4">${descText}</div>` : '';
    const portionSize = item.portion_size || '';
    
    // Note: packaging is only shown in the dedicated Packaging Preference column, not in the description
    return `<tr style="background:${bg}">
      <td style="padding:8px 16px;border-bottom:1px solid ${borderColor};width:58%">
        <div style="font-family:'Times New Roman',Times,serif;font-size:16px;font-weight:600;color:${c.primary}">${escapeHtml(item.item_name)}</div>
        ${desc}
      </td>
      <td style="padding:8px 6px;text-align:center;border-bottom:1px solid ${borderColor};width:10%;font-family:'Times New Roman',Times,serif;font-size:12px">${escapeHtml(portionSize)}</td>
      <td style="padding:8px 6px;text-align:center;border-bottom:1px solid ${borderColor};width:10%;font-family:'Times New Roman',Times,serif;font-size:12px">${escapeHtml(item.portion_size || '1')}</td>
      <td style="padding:8px 6px;text-align:center;border-bottom:1px solid ${borderColor};width:22%;font-family:'Times New Roman',Times,serif;font-size:12px;font-weight:bold">${escapeHtml(item.packaging || '')}</td>
    </tr>`;
  }).join('');

  // Use URL for logo so frontend can fetch it
  const logoUrl = order._logoUrl || '/assets/logo.png';
  const logoImg = `<img src="${escapeHtml(logoUrl)}" style="height:200px;margin-bottom:12px" alt="${escapeHtml(s.company.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/><div style="display:none;font-size:24px;font-weight:700;color:${c.primary};margin-bottom:12px">${escapeHtml(s.company.name)}</div>`;

  // Show status for clients, revision for caterers
  const badgeDisplay = isForCaterer 
    ? `<span class="rev">REVISION ${revisionCount}</span>`
    : `<span class="badge" style="display:inline-block;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;background:${statusBg};color:${statusColor}">${escapeHtml(statusLabel)}</span>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Order #${displayNum}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f1f5f9;padding:20px;color:${c.text}}.inv{max-width:850px;margin:0 auto;background:#fff;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);border-radius:12px;overflow:hidden}.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:32px 40px;border-bottom:1px solid ${c.borderLight}}.co-info{font-size:12px;color:${c.textLight};line-height:1.5}.inv-num{font-size:24px;font-weight:700;color:${c.primary};margin-bottom:4px}.inv-sub{font-size:14px;color:${c.text};text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;font-weight:600}.rev{font-size:12px;color:${c.textMuted};background:${c.background};padding:4px 12px;border-radius:4px;display:inline-block}.badge{display:inline-block;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600}.det{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:32px 40px;background:${c.background}}.det h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${c.textMuted};margin-bottom:16px;font-weight:600}.det-row{display:flex;margin-bottom:10px;font-size:13px}.det-lbl{width:100px;color:${c.textLight}}.det-val{font-weight:500}.bt-name{font-size:16px;font-weight:600;margin-bottom:8px}.bt-co{font-size:13px;color:${c.primary};font-weight:500;margin-bottom:8px}.bt-det{font-size:12px;color:${c.textLight};line-height:1.6}.items{padding:32px 40px}table{width:100%;border-collapse:separate;border-spacing:0;border-radius:8px;overflow:hidden;border:1px solid ${c.border}}thead th{background:${c.primary};color:#fff;padding:10px 16px;font-family:'Times New Roman',Times,serif;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px;text-align:left}thead th:nth-child(2),thead th:nth-child(3),thead th:nth-child(4){text-align:center}.ftr{padding:32px 40px;background:${c.background};border-top:1px solid ${c.borderLight};text-align:center}.ftr-msg{font-size:13px;color:${c.textLight};line-height:1.8;margin-bottom:16px}.warn{padding:0 40px 24px}.warn-box{background:#fef2f2;border:2px solid #ef4444;border-radius:8px;padding:16px 20px}.warn-title{color:#dc2626;font-size:13px;font-weight:700;margin-bottom:8px}.warn-text{color:#991b1b;font-size:12px}.inst{padding:0 40px 24px}.inst-box{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px 20px}.inst-text{color:#166534;font-size:12px;font-style:italic;line-height:1.6}</style></head>
<body><div class="inv">
<div class="hdr">
  <div>${logoImg}<div class="co-info">${escapeHtml(s.company.address)}<br/><b>Phone | ${escapeHtml(s.company.phone)}</b></div></div>
  <div style="text-align:right">
    <div class="inv-num">ORDER #${escapeHtml(displayNum)}</div>
    <div class="inv-sub">${escapeHtml(orderTypeTitle)}</div>
    ${badgeDisplay}
  </div>
</div>

<div class="det">
  <div>
    <h3>Bill To</h3>
    <div class="bt-name">${escapeHtml(clientName)}</div>
    ${clientCompany ? `<div class="bt-co">${escapeHtml(clientCompany)}</div>` : ''}
    <div class="bt-det" style="word-wrap:break-word;overflow-wrap:break-word;max-width:250px">
      ${clientAddr ? escapeHtml(clientAddr).replace(/\n/g, '<br/>') + '<br/>' : ''}
      ${clientEmail ? escapeHtml(clientEmail) + '<br/>' : ''}
      ${clientPhone ? escapeHtml(clientPhone) : ''}
    </div>
  </div>
  <div>
    <h3>Delivery Details</h3>
    <div class="det-row"><span class="det-lbl">Date & Time:</span><span class="det-val">${escapeHtml(formatDate(order.delivery_date))} &nbsp; ${escapeHtml(formatTime(order.delivery_time))}</span></div>
    <div class="det-row"><span class="det-lbl">Airport Code:</span><span class="det-val">${escapeHtml(airportCode)}</span></div>
    <div class="det-row"><span class="det-lbl">FBO:</span><span class="det-val">${escapeHtml(fboName)}</span></div>
    <div class="det-row"><span class="det-lbl">Tail#:</span><span class="det-val">${escapeHtml(order.aircraft_tail_number || '')}</span></div>
  </div>
</div>

${dietary ? `<div class="warn"><div class="warn-box"><div class="warn-title">!!! RESTRICTIONS & ALLERGIES !!!</div><div class="warn-text">** ${escapeHtml(dietary)} **</div></div></div>` : '<div class="warn"><div class="warn-box"><div class="warn-title">!!! RESTRICTIONS & ALLERGIES !!!</div><div class="warn-text">** N/A **</div></div></div>'}

${packagingInst ? `<div class="inst"><div class="inst-box"><div class="inst-text">" ${escapeHtml(packagingInst)} "</div></div></div>` : ''}

<div class="items">
  <table>
    <thead>
      <tr>
        <th style="font-size:12px">Item & Description</th>
        <th style="text-align:center;font-size:10px">Portion / Size</th>
        <th style="text-align:center;font-size:10px">Portion / Qty</th>
        <th style="text-align:center;font-size:10px">Packaging Preference</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
</div>

<div class="ftr">
  <div class="ftr-msg">Email: Inflight@Kabin247.com &nbsp;&nbsp;&nbsp; Phone: +1-813-331-5667 &nbsp; Address: 4520 W. Oakellar Ave, Unit 13061, Tampa, FL 33611</div>
</div>
</div></body></html>`;
}

/**
 * Generate PDF B (Vendor PO / Client Confirmation)
 * - No pricing information  
 * - Items grouped by category
 * - Multi-page support with page numbers
 */
export function generateOrderPDFB(order: any, styles: PDFStyleConfig = defaultPDFStyles, recipientType: 'client' | 'caterer' = 'caterer'): typeof PDFDocument.prototype {
  const c = styles.colors;
  const displayNum = getDisplayOrderNumber(order);
  const orderTypeTitle = getOrderTypeTitle(order.order_type);
  const revisionCount = order.revision_count || 0;
  const statusLabel = getStatusLabel(order.status);
  const statusColor = statusColors[order.status] || c.secondary;

  const doc = new PDFDocument({ 
    margin: styles.spacing.margin, 
    size: styles.layout.pageSize, 
    bufferPages: true,
    info: { 
      Title: `Order ${displayNum}`, 
      Author: styles.company.name, 
      Subject: orderTypeTitle 
    }
  });

  const pw = styles.layout.pageWidth;
  const ph = styles.layout.pageHeight;
  const m = styles.spacing.margin;
  const cw = styles.layout.contentWidth;

  // Check if this PDF is for a caterer (when status is awaiting_quote or awaiting_caterer, or explicitly set)
  const isForCaterer = recipientType === 'caterer' || (order.status === 'awaiting_quote' || order.status === 'awaiting_caterer');
  
  // For caterers (awaiting_quote or awaiting_caterer status), use Kabin247 info instead of client info
  const clientName = isForCaterer 
    ? 'Kabin247' 
    : decodeHtmlEntitiesForText(order.client?.full_name || order.client_name || '');
  const clientCompany = isForCaterer 
    ? '' 
    : decodeHtmlEntitiesForText(order.client?.company_name || '');
  const clientAddr = isForCaterer 
    ? decodeHtmlEntitiesForText(styles.company.address) 
    : decodeHtmlEntitiesForText(order.client?.full_address || '');
  const clientEmail = isForCaterer 
    ? 'accounting@Kabin247.com' 
    : decodeHtmlEntitiesForText(order.client?.email || '');
  const clientPhone = isForCaterer 
    ? '' 
    : decodeHtmlEntitiesForText(order.client?.contact_number || '');
  // Use airport_details codes if available, otherwise fall back to order.airport field (which may contain code or name)
  const airportCode = decodeHtmlEntitiesForText(
    order.airport_details?.airport_code_iata || 
    order.airport_details?.airport_code_icao || 
    (order.airport && order.airport.length <= 10 ? order.airport : '') || // Use airport field if it looks like a code (short)
    ''
  );
  const fboName = decodeHtmlEntitiesForText(order.fbo?.fbo_name || '');
  const dietary = decodeHtmlEntitiesForText(order.dietary_restrictions || '');
  const packagingInst = decodeHtmlEntitiesForText(order.packaging_instructions || '');

  let y = m;

  // HEADER - Logo
  const logoPath = getLogoPath();
  try { if (logoPath) doc.image(logoPath, m, y, { width: 360, height: 144, fit: [360, 144] }); } catch (e) {}

  // Order number and type (aligned with logo at top)
  doc.fillColor(c.primary).fontSize(27).font(styles.fonts.bold).text(`ORDER #${displayNum}`, m, y, { width: cw, align: 'right' });
  doc.fillColor(c.text).fontSize(17).font(styles.fonts.bold).text(orderTypeTitle, m, y + 33, { width: cw, align: 'right' });
  
  // Show status for clients, revision for caterers
  const badgeY = y + 50;
  if (isForCaterer) {
    // Revision badge for caterers
    const revText = `REVISION ${revisionCount}`;
    const revW = doc.widthOfString(revText) + 16;
    doc.roundedRect(pw - m - revW, badgeY, revW, 18, 4).fillColor(c.background).fill();
    doc.fillColor(c.textMuted).fontSize(14).font(styles.fonts.body).text(revText, pw - m - revW, badgeY + 2, { width: revW, align: 'center' });
  } else {
    // Status badge for clients
    const badgeW = doc.widthOfString(statusLabel) + 24;
    const badgeX = pw - m - badgeW;
    doc.roundedRect(badgeX, badgeY, badgeW, 22, 11).fillColor(statusColor).fill();
    doc.fillColor(c.white).fontSize(14).font(styles.fonts.bold).text(statusLabel, badgeX, badgeY + 6, { width: badgeW, align: 'center' });
  }

  // Company info
  doc.fillColor(c.textLight).fontSize(12).font(styles.fonts.body).text(styles.company.address, m, y + 155).text(`Phone | ${styles.company.phone}`, m, y + 170);

  y += 190;
  doc.moveTo(m, y).lineTo(pw - m, y).strokeColor(c.borderLight).lineWidth(1).stroke();
  y += 15;

  // DETAILS SECTION
  const dh = 100;
  doc.rect(m, y, cw, dh).fillColor(c.background).fill();

  const lx = m + 15, rx = pw / 2 + 10;
  let dy = y + 12;

  // Bill To
  doc.fillColor(c.textMuted).fontSize(12).font(styles.fonts.bold).text('BILL TO', lx, dy);
  let by = dy + 21;
  doc.fillColor(c.text).fontSize(17).font(styles.fonts.bold).text(clientName, lx, by);
  by += 21;
  if (clientCompany) {
    doc.fillColor(c.primary).fontSize(15).font(styles.fonts.bold).text(clientCompany, lx, by);
    by += 18;
  }
  doc.fillColor(c.textLight).fontSize(12).font(styles.fonts.body);
  if (clientAddr) { 
    const startY = by;
    doc.text(clientAddr, lx, by, { width: 180, lineBreak: true });
    const endY = doc.y;
    by = endY + 10; // Add proper spacing after wrapped address text
  }
  if (clientEmail) { doc.text(clientEmail, lx, by); by += 18; }
  if (clientPhone) { doc.text(clientPhone, lx, by); }

  // Delivery Details
  doc.fillColor(c.textMuted).fontSize(12).font(styles.fonts.bold).text('DELIVERY DETAILS', rx, dy);
  let ry = dy + 21;
  const row = (l: string, v: string, yy: number) => {
    doc.fillColor(c.textLight).fontSize(12).font(styles.fonts.body).text(l, rx, yy);
    doc.fillColor(c.text).font(styles.fonts.bold).text(v, rx + 70, yy);
    return yy + 18;
  };
  ry = row('Date & Time:', `${formatDate(order.delivery_date)}   ${formatTime(order.delivery_time)}`, ry);
  ry = row('Airport Code:', airportCode, ry);
  ry = row('FBO:', fboName, ry);
  row('Tail#:', order.aircraft_tail_number || '', ry);

  y += dh + 10;

  // RESTRICTIONS & ALLERGIES
  const warnH = 53;
  doc.roundedRect(m, y, cw, warnH, 4).fillColor('#fef2f2').fill();
  doc.roundedRect(m, y, cw, warnH, 4).strokeColor('#ef4444').lineWidth(1.5).stroke();
  doc.fillColor('#dc2626').fontSize(14).font(styles.fonts.bold).text('!!! RESTRICTIONS & ALLERGIES !!!', m + 15, y + 12);
  doc.fillColor('#991b1b').fontSize(12).font(styles.fonts.body).text(dietary ? `** ${dietary} **` : '** N/A **', m + 15, y + 30);
  y += warnH + 15;

  // PACKAGING INSTRUCTIONS (if any)
  if (packagingInst) {
    const instH = 55; // Increased height for better spacing
    doc.roundedRect(m, y, cw, instH, 4).fillColor('#f0fdf4').fill();
    doc.roundedRect(m, y, cw, instH, 4).strokeColor('#86efac').lineWidth(1).stroke();
    doc.fillColor('#166534').fontSize(12).font(styles.fonts.body).text(`" ${packagingInst} "`, m + 15, y + 18, { width: cw - 30, lineBreak: true });
    y += instH + 18; // Increased spacing after section
  }

  // TABLE - Items grouped by category
  const tw = cw;
  const cols = { item: tw * 0.50, portion: tw * 0.12, qty: tw * 0.12, packaging: tw * 0.26 };

  // Table header
  const drawTableHeader = (yPos: number) => {
    doc.roundedRect(m, yPos, tw, 39, 3).fillColor(c.primary).fill();
    doc.fillColor(c.white).fontSize(12).font(styles.fonts.bold);
    doc.text('Item & Description', m + 10, yPos + 14);
    doc.text('Portion / Size', m + cols.item, yPos + 14, { width: cols.portion, align: 'center' });
    doc.text('Portions/Servings/Qty', m + cols.item + cols.portion, yPos + 14, { width: cols.qty, align: 'center' });
    doc.text('Packaging Preference', m + cols.item + cols.portion + cols.qty, yPos + 14, { width: cols.packaging, align: 'center' });
    return yPos + 39;
  };

  y = drawTableHeader(y);

  // Group items by category
  const groupedItems = groupItemsByCategory(order.items || []);
  let rowIdx = 0;

  groupedItems.forEach((items, category) => {
    // Check if we need a new page
    if (y > ph - 120) {
      doc.addPage();
      y = m;
      y = drawTableHeader(y);
    }

    // Category header (grey background)
    doc.rect(m, y, tw, 33).fillColor('#9ca3af').fill();
    doc.fillColor(c.white).fontSize(14).font(styles.fonts.bold).text(category.toUpperCase(), m + 10, y + 11);
    y += 33;

    // Items in category
    items.forEach((item: any) => {
      const hasDesc = item.item_description?.trim();
      const rh = hasDesc ? 54 : 36;

      // Check if we need a new page
      if (y + rh > ph - 80) {
        doc.addPage();
        y = m;
        y = drawTableHeader(y);
      }

      doc.rect(m, y, tw, rh).fillColor(rowIdx % 2 === 0 ? c.white : c.backgroundAlt).fill();
      doc.moveTo(m, y + rh).lineTo(m + tw, y + rh).strokeColor(c.borderLight).lineWidth(0.5).stroke();

      const ty = y + (hasDesc ? 9 : 12);
      doc.fillColor(c.primary).fontSize(15).font(styles.fonts.bold).text(decodeHtmlEntitiesForText(item.item_name || ''), m + 10, ty, { width: cols.item - 15 });
      if (hasDesc) {
        doc.fillColor(c.textLight).fontSize(11).font(styles.fonts.body).text(decodeHtmlEntitiesForText(item.item_description), m + 10, ty + 18, { width: cols.item - 15 });
      }
      doc.fillColor(c.text).fontSize(14).font(styles.fonts.body);
      doc.text(item.portion_size || '', m + cols.item, ty, { width: cols.portion, align: 'center' });
      doc.text(item.portion_size || '1', m + cols.item + cols.portion, ty, { width: cols.qty, align: 'center' });
      doc.text(item.packaging || '', m + cols.item + cols.portion + cols.qty, ty, { width: cols.packaging, align: 'center' });

      y += rh;
      rowIdx++;
    });
  });

  // Table bottom border
  doc.roundedRect(m, y - 1, tw, 2, 1).fillColor(c.border).fill();
  y += 20;

  // FOOTER - Only add if we have content that needs it
  const footerHeight = 40;
  if (y + footerHeight > ph - 30) {
    doc.addPage();
    y = m;
  }
  
  const fy = Math.max(y, ph - footerHeight - 10);
  doc.moveTo(m, fy).lineTo(pw - m, fy).strokeColor(c.borderLight).lineWidth(1).stroke();
  doc.fillColor(c.textLight).fontSize(12).font(styles.fonts.body)
    .text('Email: Inflight@Kabin247.com   Phone: +1-813-331-5667  Address: 4520 W. Oakellar Ave, Unit 13061, Tampa, FL 33611', m, fy + 18, { width: cw, align: 'center' });

  // Add page numbers only to pages that have content
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    // Only add page number if this page has content (not empty)
    doc.fillColor(c.textMuted).fontSize(12).font(styles.fonts.body)
      .text(`Page ${i + 1} of ${pages.count}`, m, ph - 30, { width: cw, align: 'right' });
  }

  return doc;
}

/**
 * Generate PDF B buffer
 */
export async function generateOrderPDFBBuffer(order: any, recipientType: 'client' | 'caterer' = 'caterer'): Promise<Buffer> {
  // Generate HTML
  let html = generateOrderHTMLB(order, recipientType);
  
  // Replace logo URL with data URI for PDF generation
  const logoDataUri = getLogoDataUri();
  if (logoDataUri) {
    html = html.replace(/src="[^"]*logo\.png[^"]*"/g, `src="${logoDataUri}"`);
  }
  
  // Convert HTML to PDF using puppeteer
  const chromePath = getChromeExecutablePath();
  const launchOptions: any = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ]
  };
  
  if (chromePath) {
    launchOptions.executablePath = chromePath;
  }
  
  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });
    
    return Buffer.from(pdfBuffer);
  } catch (error: any) {
    throw new Error(`Failed to generate PDF: ${error.message}. Chrome path: ${chromePath || 'default'}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export function generateOrderEmailHTML(order: any, customMessage?: string): string {
  const s = defaultPDFStyles;
  const c = s.colors;
  const displayNum = getDisplayOrderNumber(order);
  const itemsHTML = (order.items || []).map((item: any) => `<tr><td style="padding:12px;border-bottom:1px solid ${c.borderLight};color:${c.primary};font-weight:500">${escapeHtml(item.item_name)}</td><td style="padding:12px;text-align:center;border-bottom:1px solid ${c.borderLight}">${escapeHtml(item.portion_size)}</td><td style="padding:12px;text-align:right;border-bottom:1px solid ${c.borderLight}">$${formatPrice(item.price)}</td></tr>`).join('');

  // Use airport_details codes if available, otherwise fall back to order.airport field (which may contain code or name)
  const airportCode = order.airport_details?.airport_code_iata || 
    order.airport_details?.airport_code_icao || 
    (order.airport && order.airport.length <= 10 ? order.airport : '') || 
    '';
  const fboName = order.fbo?.fbo_name || '';
  return `<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:20px;background:#f1f5f9"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,.1)"><div style="background:${c.primary};color:#fff;padding:24px;text-align:center"><h1 style="margin:0;font-size:24px">Invoice #${escapeHtml(displayNum)}</h1><p style="margin:8px 0 0;opacity:.9">Inflight Catering Order</p></div><div style="padding:24px">${customMessage?`<p style="margin-bottom:20px;padding:16px;background:${c.background};border-radius:6px">${escapeHtml(customMessage)}</p>`:''}<div style="margin-bottom:20px"><p style="margin:8px 0"><b>Client:</b> ${escapeHtml(order.client?.full_name||order.client_name||'')}</p><p style="margin:8px 0"><b>Delivery:</b> ${escapeHtml(formatDate(order.delivery_date))} at ${escapeHtml(formatTime(order.delivery_time))}</p><p style="margin:8px 0"><b>Airport:</b> ${escapeHtml(airportCode)}${fboName?` - ${escapeHtml(fboName)}`:''}</p></div><table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid ${c.border}"><thead><tr style="background:${c.primaryDark};color:#fff"><th style="padding:12px;text-align:left;font-size:12px">Item</th><th style="padding:12px;text-align:center;font-size:12px">Qty</th><th style="padding:12px;text-align:right;font-size:12px">Price</th></tr></thead><tbody>${itemsHTML}</tbody></table><div style="margin-top:20px;text-align:right;padding:16px;background:${c.background};border-radius:6px"><p style="margin:4px 0;color:${c.textLight}">Subtotal: $${formatPrice(order.subtotal)}</p>${parseFloat(order.delivery_fee || 0)>0?`<p style="margin:4px 0;color:${c.textLight}">Delivery Fee: $${formatPrice(order.delivery_fee)}</p>`:''}${parseFloat(order.service_charge || 0)>0?`<p style="margin:4px 0;color:${c.textLight}">Service Charge: $${formatPrice(order.service_charge)}</p>`:''}${parseFloat(order.coordination_fee || 0)>0?`<p style="margin:4px 0;color:${c.textLight}">Coordination Fee: $${formatPrice(order.coordination_fee)}</p>`:''}${parseFloat(order.airport_fee || 0)>0?`<p style="margin:4px 0;color:${c.textLight}">Airport Fee: $${formatPrice(order.airport_fee)}</p>`:''}${parseFloat(order.fbo_fee || 0)>0?`<p style="margin:4px 0;color:${c.textLight}">FBO Fee: $${formatPrice(order.fbo_fee)}</p>`:''}${parseFloat(order.shopping_fee || 0)>0?`<p style="margin:4px 0;color:${c.textLight}">Shopping Fee: $${formatPrice(order.shopping_fee)}</p>`:''}${parseFloat(order.restaurant_pickup_fee || 0)>0?`<p style="margin:4px 0;color:${c.textLight}">Restaurant Pickup Fee: $${formatPrice(order.restaurant_pickup_fee)}</p>`:''}${parseFloat(order.airport_pickup_fee || 0)>0?`<p style="margin:4px 0;color:${c.textLight}">Airport Pickup Fee: $${formatPrice(order.airport_pickup_fee)}</p>`:''}<p style="margin:12px 0 0;font-size:18px;font-weight:bold;color:${c.primary}">Total: $${formatPrice(order.total)}</p></div></div><div style="background:${c.background};padding:20px;text-align:center;border-top:1px solid ${c.borderLight}"><p style="margin:0 0 8px;color:${c.textLight};font-size:13px">Thank you for your business!</p><p style="margin:0;color:${c.primary};font-weight:600">${escapeHtml(s.company.name)}</p></div></div></body></html>`;
}
