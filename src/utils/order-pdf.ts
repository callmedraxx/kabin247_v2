import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
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

export function escapeHtml(text: string): string {
  if (!text) return '';
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function formatPrice(value: any): string {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return num.toFixed(2);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
}

function formatTime(timeStr: string): string {
  return timeStr ? `${timeStr}L` : '';
}

function getStatusLabel(status: string): string {
  return statusLabels[status] || status.toUpperCase().replace(/_/g, ' ');
}

function getDisplayOrderNumber(order: any): string {
  const orderType = order.order_type || 'QE';
  const numericPart = (order.order_number || '').replace(/^KA/, '');
  return `${orderType}${numericPart}`;
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
  
  const clientName = order.client?.full_name || order.client_name || '';
  const clientAddr = order.client?.full_address || '';
  const clientEmail = order.client?.email || '';
  const clientPhone = order.client?.contact_number || '';
  const airportCode = order.airport_details?.airport_code_iata || order.airport_details?.airport_code_icao || '';
  const fboName = order.airport_details?.fbo_name || '';
  const dietary = order.dietary_restrictions || '';
  
  const itemsHTML = (order.items || []).map((item: any, i: number) => {
    const bg = i % 2 === 0 ? '#fff' : c.backgroundAlt;
    const desc = item.item_description ? `<div style="font-size:11px;color:${c.textLight};margin-top:2px">${escapeHtml(item.item_description)}</div>` : '';
    const qty = parseFloat(item.portion_size) || 1;
    return `<tr style="background:${bg}"><td style="padding:12px 16px;border-bottom:1px solid ${c.borderLight}"><div style="font-weight:500">${escapeHtml(item.item_name)}</div>${desc}</td><td style="padding:12px;text-align:center;border-bottom:1px solid ${c.borderLight}">${escapeHtml(item.portion_size)}</td><td style="padding:12px;text-align:right;color:${c.textLight};border-bottom:1px solid ${c.borderLight}">$${formatPrice(item.price/qty)}</td><td style="padding:12px;text-align:right;font-weight:600;border-bottom:1px solid ${c.borderLight}">$${formatPrice(item.price)}</td></tr>`;
  }).join('');

  // Use URL for logo so frontend can fetch it (logoUrl can be overridden via order._logoUrl)
  const logoUrl = order._logoUrl || '/assets/logo.png';
  const logoImg = `<img src="${escapeHtml(logoUrl)}" style="height:60px;margin-bottom:12px" alt="${escapeHtml(s.company.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/><div style="display:none;font-size:24px;font-weight:700;color:${c.primary};margin-bottom:12px">${escapeHtml(s.company.name)}</div>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Invoice #${displayNum}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f1f5f9;padding:20px;color:${c.text}}.inv{max-width:800px;margin:0 auto;background:#fff;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);border-radius:12px;overflow:hidden}.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:32px 40px;border-bottom:1px solid ${c.borderLight}}.co-info{font-size:12px;color:${c.textLight};line-height:1.5}.inv-num{font-size:24px;font-weight:700;color:${c.primary};margin-bottom:4px}.inv-sub{font-size:13px;color:${c.textLight};text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px}.badge{display:inline-block;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;background:${statusBg};color:${statusColor}}.det{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:32px 40px;background:${c.background}}.det h3{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${c.textMuted};margin-bottom:16px;font-weight:600}.det-row{display:flex;margin-bottom:10px;font-size:13px}.det-lbl{width:100px;color:${c.textLight}}.det-val{font-weight:500}.bt-name{font-size:16px;font-weight:600;margin-bottom:8px}.bt-co{font-size:13px;color:${c.primary};font-weight:500;margin-bottom:8px}.bt-det{font-size:12px;color:${c.textLight};line-height:1.6}.items{padding:32px 40px}table{width:100%;border-collapse:separate;border-spacing:0;border-radius:8px;overflow:hidden;border:1px solid ${c.border}}thead th{background:${c.primaryDark};color:#fff;padding:14px 16px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;text-align:left}thead th:nth-child(2),thead th:nth-child(3){text-align:center}thead th:last-child{text-align:right}.tots{padding:0 40px 32px;display:flex;justify-content:flex-end}.tots-box{width:280px;background:${c.background};border-radius:8px;padding:20px;border:1px solid ${c.borderLight}}.tot-row{display:flex;justify-content:space-between;padding:8px 0;font-size:13px;color:${c.textLight}}.tot-row.grand{border-top:2px solid ${c.border};margin-top:8px;padding-top:16px;font-size:16px;font-weight:700;color:${c.primary}}.ftr{padding:32px 40px;background:${c.background};border-top:1px solid ${c.borderLight};text-align:center}.ftr-msg{font-size:13px;color:${c.textLight};line-height:1.8;margin-bottom:16px}.ftr-sig{font-size:14px;font-weight:600;color:${c.primary};margin-bottom:8px}.ftr-tag{font-size:12px;color:${c.textMuted};font-style:italic}.inst{padding:0 40px 32px}.inst-box{background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:20px}.inst-box h4{color:#b45309;font-size:13px;font-weight:600;margin-bottom:12px}.inst-item{font-size:12px;color:#78350f;margin-bottom:8px}</style></head>
<body><div class="inv">
<div class="hdr"><div>${logoImg}<div class="co-info">${escapeHtml(s.company.address)}<br/><b>Phone | ${escapeHtml(s.company.phone)}</b></div></div><div style="text-align:right"><div class="inv-num">INVOICE #${escapeHtml(displayNum)}</div><div class="inv-sub">Inflight Catering Order</div><span class="badge">${escapeHtml(statusLabel)}</span></div></div>
<div class="det"><div><h3>Bill To</h3><div class="bt-name">${escapeHtml(clientName)}</div><div class="bt-co">${escapeHtml(s.company.name)}</div><div class="bt-det">${clientAddr?escapeHtml(clientAddr)+'<br/>':''}${clientEmail?escapeHtml(clientEmail)+'<br/>':''}${clientPhone?escapeHtml(clientPhone):''}</div></div><div><h3>Delivery Details</h3><div class="det-row"><span class="det-lbl">Date & Time:</span><span class="det-val">${escapeHtml(formatDate(order.delivery_date))} &nbsp; ${escapeHtml(formatTime(order.delivery_time))}</span></div><div class="det-row"><span class="det-lbl">Airport Code:</span><span class="det-val">${escapeHtml(airportCode)}</span></div><div class="det-row"><span class="det-lbl">FBO:</span><span class="det-val">${escapeHtml(fboName)}</span></div><div class="det-row"><span class="det-lbl">Tail#:</span><span class="det-val">${escapeHtml(order.aircraft_tail_number||'')}</span></div>${dietary?`<div class="det-row"><span class="det-lbl">Dietary:</span><span class="det-val">${escapeHtml(dietary)}</span></div>`:''}</div></div>
<div class="items"><table><thead><tr><th>Item & Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Cost</th><th style="text-align:right">Total</th></tr></thead><tbody>${itemsHTML}</tbody></table></div>
${(order.reheating_instructions||order.packaging_instructions)?`<div class="inst"><div class="inst-box"><h4>⚠️ Special Instructions</h4>${order.reheating_instructions?`<div class="inst-item"><b>Reheating:</b> ${escapeHtml(order.reheating_instructions)}</div>`:''}${order.packaging_instructions?`<div class="inst-item"><b>Packaging:</b> ${escapeHtml(order.packaging_instructions)}</div>`:''}</div></div>`:''}
<div class="tots"><div class="tots-box"><div class="tot-row"><span>Subtotal:</span><span>$${formatPrice(order.subtotal)}</span></div>${order.delivery_fee>0?`<div class="tot-row"><span>${escapeHtml(airportCode)} Delivery Fee:</span><span>$${formatPrice(order.delivery_fee)}</span></div>`:''}${order.service_charge>0?`<div class="tot-row"><span>Service Charge:</span><span>$${formatPrice(order.service_charge)}</span></div>`:''}<div class="tot-row grand"><span>Total:</span><span>$${formatPrice(order.total)}</span></div></div></div>
<div class="ftr"><div class="ftr-msg">Thank you for allowing us to manage your catering needs.<br/>Kindly submit payment for the above invoice.</div><div class="ftr-sig">Sincerely, ${escapeHtml(s.company.name)}</div><div class="ftr-tag">${escapeHtml(s.company.tagline)}</div></div>
</div></body></html>`;
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

  const clientName = order.client?.full_name || order.client_name || '';
  const clientAddr = order.client?.full_address || '';
  const clientEmail = order.client?.email || '';
  const clientPhone = order.client?.contact_number || '';
  const airportCode = order.airport_details?.airport_code_iata || order.airport_details?.airport_code_icao || '';
  const fboName = order.airport_details?.fbo_name || '';
  const dietary = order.dietary_restrictions || '';

  let y = m;

  // HEADER - Logo
  const logoPath = getLogoPath();
  try { if (logoPath) doc.image(logoPath, m, y, { width: 120, height: 50, fit: [120, 50] }); } catch (e) {}

  doc.fillColor(c.primary).fontSize(18).font(styles.fonts.bold).text(`INVOICE #${displayNum}`, m, y, { width: cw, align: 'right' });
  doc.fillColor(c.textLight).fontSize(10).font(styles.fonts.body).text('INFLIGHT CATERING ORDER', m, y + 22, { width: cw, align: 'right' });

  const badgeY = y + 40;
  const badgeW = doc.widthOfString(statusLabel) + 24;
  const badgeX = pw - m - badgeW;
  doc.roundedRect(badgeX, badgeY, badgeW, 22, 11).fillColor(statusColor).fill();
  doc.fillColor(c.white).fontSize(9).font(styles.fonts.bold).text(statusLabel, badgeX, badgeY + 6, { width: badgeW, align: 'center' });

  const coY = y + 60;
  doc.fillColor(c.textLight).fontSize(9).font(styles.fonts.body).text(styles.company.address, m, coY).text(`Phone | ${styles.company.phone}`, m, coY + 12);

  y = coY + 40;
  doc.moveTo(m, y).lineTo(pw - m, y).strokeColor(c.borderLight).lineWidth(1).stroke();
  y += 20;

  // DETAILS
  const dh = 130;
  doc.rect(m, y, cw, dh).fillColor(c.background).fill();

  const lx = m + 20, rx = pw / 2 + 20;
  let dy = y + 15;

  doc.fillColor(c.textMuted).fontSize(9).font(styles.fonts.bold).text('BILL TO', lx, dy);
  let by = dy + 18;
  doc.fillColor(c.text).fontSize(13).font(styles.fonts.bold).text(clientName, lx, by);
  by += 18;
  doc.fillColor(c.primary).fontSize(11).font(styles.fonts.bold).text(styles.company.name, lx, by);
  by += 16;
  doc.fillColor(c.textLight).fontSize(9).font(styles.fonts.body);
  if (clientAddr) { doc.text(clientAddr, lx, by, { width: 200 }); by += 12; }
  if (clientEmail) { doc.text(clientEmail, lx, by); by += 12; }
  if (clientPhone) { doc.text(clientPhone, lx, by); }

  doc.fillColor(c.textMuted).fontSize(9).font(styles.fonts.bold).text('DELIVERY DETAILS', rx, dy);
  let ry = dy + 18;
  const row = (l: string, v: string, yy: number) => {
    doc.fillColor(c.textLight).fontSize(9).font(styles.fonts.body).text(l, rx, yy);
    doc.fillColor(c.text).font(styles.fonts.bold).text(v, rx + 80, yy);
    return yy + 16;
  };
  ry = row('Date & Time:', `${formatDate(order.delivery_date)}   ${formatTime(order.delivery_time)}`, ry);
  ry = row('Airport Code:', airportCode, ry);
  ry = row('FBO:', fboName, ry);
  ry = row('Tail#:', order.aircraft_tail_number || '', ry);
  if (dietary) row('Dietary:', dietary, ry);

  y += dh + 20;

  // TABLE
  const tw = cw;
  const cols = { item: tw * 0.50, qty: tw * 0.12, unit: tw * 0.18, total: tw * 0.20 };

  doc.roundedRect(m, y, tw, 32, 4).fillColor(c.primaryDark).fill();
  doc.fillColor(c.white).fontSize(9).font(styles.fonts.bold);
  const hy = y + 11;
  doc.text('Item & Description', m + 12, hy);
  doc.text('Qty', m + cols.item, hy, { width: cols.qty, align: 'center' });
  doc.text('Unit Cost', m + cols.item + cols.qty, hy, { width: cols.unit, align: 'right' });
  doc.text('Total', m + cols.item + cols.qty + cols.unit, hy, { width: cols.total - 12, align: 'right' });
  y += 32;

  (order.items || []).forEach((item: any, i: number) => {
    const hasDesc = item.item_description?.trim();
    const rh = hasDesc ? 42 : 28;
    doc.rect(m, y, tw, rh).fillColor(i % 2 === 0 ? c.white : c.backgroundAlt).fill();
    doc.moveTo(m, y + rh).lineTo(m + tw, y + rh).strokeColor(c.borderLight).lineWidth(0.5).stroke();

    const ty = y + (hasDesc ? 8 : 9);
    doc.fillColor(c.text).fontSize(10).font(styles.fonts.bold).text(item.item_name || '', m + 12, ty, { width: cols.item - 20 });
    if (hasDesc) doc.fillColor(c.textLight).fontSize(8).font(styles.fonts.body).text(item.item_description, m + 12, ty + 14, { width: cols.item - 20 });
    doc.fillColor(c.text).fontSize(10).font(styles.fonts.body).text(item.portion_size || '', m + cols.item, ty, { width: cols.qty, align: 'center' });
    const qty = parseFloat(item.portion_size) || 1;
    doc.fillColor(c.textLight).text(`$${formatPrice(item.price / qty)}`, m + cols.item + cols.qty, ty, { width: cols.unit, align: 'right' });
    doc.fillColor(c.text).font(styles.fonts.bold).text(`$${formatPrice(item.price)}`, m + cols.item + cols.qty + cols.unit, ty, { width: cols.total - 12, align: 'right' });
    y += rh;
  });

  doc.roundedRect(m, y - 1, tw, 2, 1).fillColor(c.border).fill();
  y += 25;

  // INSTRUCTIONS
  if (order.reheating_instructions || order.packaging_instructions) {
    const ih = 60;
    doc.roundedRect(m, y, cw, ih, 6).fillColor('#fffbeb').fill();
    doc.roundedRect(m, y, cw, ih, 6).strokeColor('#fcd34d').lineWidth(1).stroke();
    doc.fillColor('#b45309').fontSize(10).font(styles.fonts.bold).text('⚠ Special Instructions', m + 15, y + 12);
    let iy = y + 28;
    doc.fontSize(9).font(styles.fonts.body).fillColor('#78350f');
    if (order.reheating_instructions) { doc.font(styles.fonts.bold).text('Reheating: ', m + 15, iy, { continued: true }); doc.font(styles.fonts.body).text(order.reheating_instructions); iy += 14; }
    if (order.packaging_instructions) { doc.font(styles.fonts.bold).text('Packaging: ', m + 15, iy, { continued: true }); doc.font(styles.fonts.body).text(order.packaging_instructions); }
    y += ih + 15;
  }

  // TOTALS
  const totW = 220, totX = pw - m - totW, totH = 100;
  doc.roundedRect(totX, y, totW, totH, 6).fillColor(c.background).fill();
  doc.roundedRect(totX, y, totW, totH, 6).strokeColor(c.borderLight).lineWidth(1).stroke();

  let ty = y + 15;
  doc.fillColor(c.textLight).fontSize(10).font(styles.fonts.body);
  doc.text('Subtotal:', totX + 15, ty).text(`$${formatPrice(order.subtotal)}`, totX + 15, ty, { width: totW - 30, align: 'right' });
  ty += 16;
  if (order.delivery_fee > 0) { doc.text(`${airportCode} Delivery Fee:`, totX + 15, ty).text(`$${formatPrice(order.delivery_fee)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 16; }
  if (order.service_charge > 0) { doc.text('Service Charge:', totX + 15, ty).text(`$${formatPrice(order.service_charge)}`, totX + 15, ty, { width: totW - 30, align: 'right' }); ty += 16; }
  ty += 5;
  doc.moveTo(totX + 15, ty).lineTo(totX + totW - 15, ty).strokeColor(c.border).lineWidth(1.5).stroke();
  ty += 12;
  doc.fillColor(c.primary).fontSize(14).font(styles.fonts.bold);
  doc.text('Total:', totX + 15, ty).text(`$${formatPrice(order.total)}`, totX + 15, ty, { width: totW - 30, align: 'right' });

  y += totH + 30;

  // FOOTER
  const fy = Math.max(y, styles.layout.pageHeight - 130);
  doc.moveTo(m, fy).lineTo(pw - m, fy).strokeColor(c.borderLight).lineWidth(1).stroke();
  doc.fillColor(c.textLight).fontSize(10).font(styles.fonts.body).text('Thank you for allowing us to manage your catering needs.', m, fy + 15, { width: cw, align: 'center' }).text('Kindly submit payment for the above invoice.', m, fy + 28, { width: cw, align: 'center' });
  doc.fillColor(c.text).fontSize(11).text('Sincerely,', m, fy + 50, { width: cw, align: 'center' });
  doc.fillColor(c.primary).font(styles.fonts.bold).text(styles.company.name, m, fy + 64, { width: cw, align: 'center' });
  doc.fillColor(c.textMuted).fontSize(9).font(styles.fonts.body).text(styles.company.tagline, m, fy + 85, { width: cw, align: 'center' });

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
  const s = defaultPDFStyles;
  const c = s.colors;
  const displayNum = getDisplayOrderNumber(order);
  const itemsHTML = (order.items || []).map((item: any) => `<tr><td style="padding:12px;border-bottom:1px solid ${c.borderLight}">${escapeHtml(item.item_name)}</td><td style="padding:12px;text-align:center;border-bottom:1px solid ${c.borderLight}">${escapeHtml(item.portion_size)}</td><td style="padding:12px;text-align:right;border-bottom:1px solid ${c.borderLight}">$${formatPrice(item.price)}</td></tr>`).join('');

  return `<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;margin:0;padding:20px;background:#f1f5f9"><div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,.1)"><div style="background:${c.primary};color:#fff;padding:24px;text-align:center"><h1 style="margin:0;font-size:24px">Invoice #${escapeHtml(displayNum)}</h1><p style="margin:8px 0 0;opacity:.9">Inflight Catering Order</p></div><div style="padding:24px">${customMessage?`<p style="margin-bottom:20px;padding:16px;background:${c.background};border-radius:6px">${escapeHtml(customMessage)}</p>`:''}<div style="margin-bottom:20px"><p style="margin:8px 0"><b>Client:</b> ${escapeHtml(order.client?.full_name||order.client_name||'')}</p><p style="margin:8px 0"><b>Delivery:</b> ${escapeHtml(formatDate(order.delivery_date))} at ${escapeHtml(formatTime(order.delivery_time))}</p><p style="margin:8px 0"><b>Airport:</b> ${escapeHtml(order.airport_details?.airport_code_iata||'')} - ${escapeHtml(order.airport_details?.fbo_name||'')}</p></div><table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid ${c.border}"><thead><tr style="background:${c.primaryDark};color:#fff"><th style="padding:12px;text-align:left;font-size:12px">Item</th><th style="padding:12px;text-align:center;font-size:12px">Qty</th><th style="padding:12px;text-align:right;font-size:12px">Price</th></tr></thead><tbody>${itemsHTML}</tbody></table><div style="margin-top:20px;text-align:right;padding:16px;background:${c.background};border-radius:6px"><p style="margin:4px 0;color:${c.textLight}">Subtotal: $${formatPrice(order.subtotal)}</p>${order.delivery_fee>0?`<p style="margin:4px 0;color:${c.textLight}">Delivery Fee: $${formatPrice(order.delivery_fee)}</p>`:''}${order.service_charge>0?`<p style="margin:4px 0;color:${c.textLight}">Service Charge: $${formatPrice(order.service_charge)}</p>`:''}<p style="margin:12px 0 0;font-size:18px;font-weight:bold;color:${c.primary}">Total: $${formatPrice(order.total)}</p></div></div><div style="background:${c.background};padding:20px;text-align:center;border-top:1px solid ${c.borderLight}"><p style="margin:0 0 8px;color:${c.textLight};font-size:13px">Thank you for your business!</p><p style="margin:0;color:${c.primary};font-weight:600">${escapeHtml(s.company.name)}</p></div></div></body></html>`;
}
