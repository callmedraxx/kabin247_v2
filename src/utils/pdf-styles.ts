/**
 * PDF Styling Configuration
 * Customize colors, fonts, layout, and company info here
 */

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  tagline: string;
}

export interface PDFStyleConfig {
  colors: {
    primary: string;
    primaryDark: string;
    secondary: string;
    accent: string;
    success: string;
    danger: string;
    warning: string;
    background: string;
    backgroundAlt: string;
    border: string;
    borderLight: string;
    text: string;
    textLight: string;
    textMuted: string;
    white: string;
  };
  fonts: {
    header: string;
    body: string;
    bold: string;
  };
  spacing: {
    margin: number;
    sectionSpacing: number;
    lineHeight: number;
    tableRowHeight: number;
  };
  layout: {
    pageSize: 'LETTER' | 'A4';
    pageWidth: number;
    pageHeight: number;
    contentWidth: number;
  };
  company: CompanyInfo;
}

export const defaultPDFStyles: PDFStyleConfig = {
  colors: {
    primary: '#1e40af',       // Deep Blue - Main brand color
    primaryDark: '#1e3a8a',   // Darker blue for headers
    secondary: '#475569',     // Slate gray - Secondary elements
    accent: '#3b82f6',        // Bright blue - Accents
    success: '#059669',       // Emerald - Success/delivered
    danger: '#dc2626',        // Red - Errors/cancelled
    warning: '#d97706',       // Amber - Warnings
    background: '#f8fafc',    // Light slate - Section backgrounds
    backgroundAlt: '#f1f5f9', // Slightly darker for alternating rows
    border: '#cbd5e1',        // Slate border
    borderLight: '#e2e8f0',   // Light border
    text: '#0f172a',          // Near black - Primary text
    textLight: '#475569',     // Slate - Secondary text
    textMuted: '#94a3b8',     // Muted text
    white: '#ffffff',
  },
  fonts: {
    header: 'Helvetica-Bold',
    body: 'Helvetica',
    bold: 'Helvetica-Bold',
  },
  spacing: {
    margin: 40,
    sectionSpacing: 16,
    lineHeight: 16,
    tableRowHeight: 28,
  },
  layout: {
    pageSize: 'LETTER',
    pageWidth: 612,
    pageHeight: 792,
    contentWidth: 532, // pageWidth - 2 * margin
  },
  company: {
    name: 'Kabin247',
    address: '4520 W. Oakellar Ave, #13061, Tampa, FL 33611',
    phone: '813-331-5667',
    email: 'info@kabin247.com',
    tagline: 'Offering you one point of contact for your global catering needs',
  },
};

/**
 * Human-friendly status labels
 */
export const statusLabels: { [key: string]: string } = {
  'awaiting_quote': 'PENDING QUOTE',
  'awaiting_caterer': 'AWAITING CATERER',
  'quote_sent': 'QUOTE SENT',
  'quote_approved': 'APPROVED',
  'in_preparation': 'IN PREPARATION',
  'ready_for_delivery': 'READY FOR DELIVERY',
  'delivered': 'DELIVERED',
  'cancelled': 'CANCELLED',
};

/**
 * Status color mapping
 */
export const statusColors: { [key: string]: string } = {
  'awaiting_quote': '#6366f1',      // Indigo
  'awaiting_caterer': '#8b5cf6',    // Purple
  'quote_sent': '#3b82f6',          // Blue
  'quote_approved': '#059669',      // Emerald
  'in_preparation': '#d97706',      // Amber
  'ready_for_delivery': '#0891b2',  // Cyan
  'delivered': '#059669',           // Emerald
  'cancelled': '#dc2626',           // Red
};

/**
 * Status background colors (lighter versions)
 */
export const statusBackgrounds: { [key: string]: string } = {
  'awaiting_quote': '#eef2ff',
  'awaiting_caterer': '#f3e8ff',
  'quote_sent': '#eff6ff',
  'quote_approved': '#ecfdf5',
  'in_preparation': '#fffbeb',
  'ready_for_delivery': '#ecfeff',
  'delivered': '#ecfdf5',
  'cancelled': '#fef2f2',
};

/**
 * Priority color mapping
 */
export const priorityColors: { [key: string]: string } = {
  'urgent': '#dc2626',
  'high': '#d97706',
  'normal': '#3b82f6',
  'low': '#6b7280',
};

/**
 * Order type display names
 */
export const orderTypeLabels: { [key: string]: string } = {
  'QE': 'Quick Eats',
  'Serv': 'Service',
  'Hub': 'Hub',
};
