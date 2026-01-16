import { Client } from './client';
import { Caterer } from './caterer';
import { Airport } from './airport';
import { FBO } from './fbo';

export interface OrderItem {
  id?: number;
  order_id?: number;
  menu_item_id?: number;
  item_name: string;
  item_description?: string;
  portion_size: string; // Quantity (purely number)
  portion_serving?: string; // Size (can be number or mixture like "200ml", "500mg")
  price: number;
  category?: string;
  packaging?: string;
  sort_order?: number;
}

// Order type aliases for frontend convenience
export type OrderTypeAlias = 'inflight' | 'qe_serv_hub' | 'restaurant_pickup';

// Order type display names
export type OrderType = 'Inflight order' | 'QE Serv Hub Order' | 'Restaurant Pickup Order';

// Mapping from aliases to display names
export const ORDER_TYPE_MAP: Record<OrderTypeAlias, OrderType> = {
  inflight: 'Inflight order',
  qe_serv_hub: 'QE Serv Hub Order',
  restaurant_pickup: 'Restaurant Pickup Order',
};

// Helper function to convert alias to order type
export function getOrderTypeFromAlias(alias: string): OrderType | null {
  return ORDER_TYPE_MAP[alias as OrderTypeAlias] || null;
}

// Helper function to convert order type to alias
export function getAliasFromOrderType(orderType: OrderType): OrderTypeAlias | null {
  const entry = Object.entries(ORDER_TYPE_MAP).find(([_, value]) => value === orderType);
  return entry ? (entry[0] as OrderTypeAlias) : null;
}

export interface Order {
  id?: number;
  order_number: string;
  client_id?: number;
  caterer_id?: number;
  airport_id?: number;
  fbo_id?: number;
  client_name: string;
  caterer: string;
  airport: string;
  aircraft_tail_number?: string;
  delivery_date: string; // ISO 8601 date format: YYYY-MM-DD
  delivery_time: string; // Time format: HH:mm
  order_priority: 'low' | 'normal' | 'high' | 'urgent';
  payment_method: 'card' | 'ACH';
  status: 'awaiting_quote' | 'awaiting_client_approval' | 'awaiting_caterer' | 'caterer_confirmed' | 'in_preparation' | 'ready_for_delivery' | 'delivered' | 'cancelled' | 'order_changed';
  is_paid?: boolean;
  order_type: OrderType;
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  delivery_fee: number;
  service_charge: number;
  coordination_fee: number;
  airport_fee: number;
  fbo_fee: number;
  shopping_fee: number;
  restaurant_pickup_fee: number;
  airport_pickup_fee: number;
  subtotal: number;
  total: number;
  revision_count: number;
  items?: OrderItem[];
  client?: Client;
  caterer_details?: Caterer;
  airport_details?: Airport;
  fbo?: FBO;
  created_at?: Date;
  updated_at?: Date;
  completed_at?: Date;
  // Change tracking for PDF highlighting (not persisted to database)
  _changedFields?: string[];
  _changedItemIds?: number[];
}

export interface CreateOrderDTO {
  order_number?: string; // Optional: if provided, use it; otherwise auto-generate
  client_id?: number;
  caterer_id?: number;
  airport_id?: number;
  fbo_id?: number;
  client_name: string;
  caterer: string;
  airport: string;
  aircraft_tail_number?: string;
  delivery_date: string;
  delivery_time: string;
  order_priority: 'low' | 'normal' | 'high' | 'urgent';
  payment_method: 'card' | 'ACH';
  order_type: OrderType | OrderTypeAlias; // Accept both alias and full type
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  delivery_fee?: number;
  service_charge?: number;
  coordination_fee?: number;
  airport_fee?: number;
  fbo_fee?: number;
  shopping_fee?: number;
  restaurant_pickup_fee?: number;
  airport_pickup_fee?: number;
  items: Array<{
    menu_item_id?: number;
    item_name: string;
    item_description?: string;
    portion_size: string;
    portion_serving?: string;
    price: number;
    category?: string;
    packaging?: string;
  }>;
}

export interface CreateOrderFromRefsDTO {
  client_id: number;
  caterer_id: number;
  airport_id: number;
  fbo_id?: number;
  aircraft_tail_number?: string;
  delivery_date: string;
  delivery_time: string;
  order_priority: 'low' | 'normal' | 'high' | 'urgent';
  payment_method: 'card' | 'ACH';
  order_type: OrderType | OrderTypeAlias; // Accept both alias and full type
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  delivery_fee?: number;
  service_charge?: number;
  coordination_fee?: number;
  airport_fee?: number;
  fbo_fee?: number;
  shopping_fee?: number;
  restaurant_pickup_fee?: number;
  airport_pickup_fee?: number;
  items: Array<{
    item_id: number;
    item_description?: string | null;
    portion_size: string;
    portion_serving?: string | null;
    price: number;
    category?: string | null;
    packaging?: string | null;
  }>;
}

export interface UpdateOrderDTO {
  order_number?: string; // Allow updating order number
  client_id?: number;
  caterer_id?: number;
  airport_id?: number;
  client_name?: string;
  caterer?: string;
  airport?: string;
  fbo_id?: number | null;
  aircraft_tail_number?: string;
  delivery_date?: string;
  delivery_time?: string;
  order_priority?: 'low' | 'normal' | 'high' | 'urgent';
  payment_method?: 'card' | 'ACH';
  status?: 'awaiting_quote' | 'awaiting_client_approval' | 'awaiting_caterer' | 'caterer_confirmed' | 'in_preparation' | 'ready_for_delivery' | 'delivered' | 'cancelled' | 'order_changed';
  is_paid?: boolean;
  order_type?: OrderType | OrderTypeAlias; // Accept both alias and full type
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  delivery_fee?: number;
  service_charge?: number;
  coordination_fee?: number;
  airport_fee?: number;
  fbo_fee?: number;
  shopping_fee?: number;
  restaurant_pickup_fee?: number;
  airport_pickup_fee?: number;
  items?: Array<{
    id?: number;
    menu_item_id?: number;
    item_name: string;
    item_description?: string;
    portion_size: string;
    portion_serving?: string;
    price: number;
    category?: string;
    packaging?: string;
  }>;
}

export interface OrderSearchParams {
  search?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
  client_name?: string;
  caterer?: string;
}

export interface OrderListResponse {
  orders: Order[];
  total: number;
  page: number;
  limit: number;
}

export interface OrderStatusUpdateDTO {
  status: 'awaiting_quote' | 'awaiting_client_approval' | 'awaiting_caterer' | 'caterer_confirmed' | 'in_preparation' | 'ready_for_delivery' | 'delivered' | 'cancelled' | 'order_changed';
  is_paid?: boolean;
}

export interface OrderEmailDTO {
  recipient: 'client' | 'caterer' | 'both';
  subject?: string;
  message?: string;
  include_pdf?: boolean;
}
