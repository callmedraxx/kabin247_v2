import { Client } from './client';
import { Caterer } from './caterer';
import { Airport } from './airport';

export interface OrderItem {
  id?: number;
  order_id?: number;
  menu_item_id?: number;
  item_name: string;
  item_description?: string;
  portion_size: string;
  price: number;
  sort_order?: number;
}

export type OrderType = 'QE' | 'Serv' | 'Hub';

export interface Order {
  id?: number;
  order_number: string;
  client_id?: number;
  caterer_id?: number;
  airport_id?: number;
  client_name: string;
  caterer: string;
  airport: string;
  aircraft_tail_number?: string;
  delivery_date: string; // ISO 8601 date format: YYYY-MM-DD
  delivery_time: string; // Time format: HH:mm
  order_priority: 'low' | 'normal' | 'high' | 'urgent';
  payment_method: 'card' | 'ACH';
  status: 'awaiting_quote' | 'awaiting_caterer' | 'quote_sent' | 'quote_approved' | 'in_preparation' | 'ready_for_delivery' | 'delivered' | 'cancelled';
  order_type: OrderType;
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  delivery_fee: number;
  service_charge: number;
  subtotal: number;
  total: number;
  items?: OrderItem[];
  client?: Client;
  caterer_details?: Caterer;
  airport_details?: Airport;
  created_at?: Date;
  updated_at?: Date;
  completed_at?: Date;
}

export interface CreateOrderDTO {
  client_id?: number;
  caterer_id?: number;
  airport_id?: number;
  client_name: string;
  caterer: string;
  airport: string;
  aircraft_tail_number?: string;
  delivery_date: string;
  delivery_time: string;
  order_priority: 'low' | 'normal' | 'high' | 'urgent';
  payment_method: 'card' | 'ACH';
  order_type: OrderType;
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  delivery_fee?: number;
  service_charge?: number;
  items: Array<{
    menu_item_id?: number;
    item_name: string;
    item_description?: string;
    portion_size: string;
    price: number;
  }>;
}

export interface CreateOrderFromRefsDTO {
  client_id: number;
  caterer_id: number;
  airport_id: number;
  aircraft_tail_number?: string;
  delivery_date: string;
  delivery_time: string;
  order_priority: 'low' | 'normal' | 'high' | 'urgent';
  payment_method: 'card' | 'ACH';
  order_type: OrderType;
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  delivery_fee?: number;
  service_charge?: number;
  items: Array<{
    item_id: number;
    item_description?: string | null;
    portion_size: string;
    price: number;
  }>;
}

export interface UpdateOrderDTO {
  client_name?: string;
  caterer?: string;
  airport?: string;
  aircraft_tail_number?: string;
  delivery_date?: string;
  delivery_time?: string;
  order_priority?: 'low' | 'normal' | 'high' | 'urgent';
  payment_method?: 'card' | 'ACH';
  status?: 'awaiting_quote' | 'awaiting_caterer' | 'quote_sent' | 'quote_approved' | 'in_preparation' | 'ready_for_delivery' | 'delivered' | 'cancelled';
  order_type?: OrderType;
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  delivery_fee?: number;
  service_charge?: number;
  items?: Array<{
    id?: number;
    item_name: string;
    item_description?: string;
    portion_size: string;
    price: number;
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
  status: 'awaiting_quote' | 'awaiting_caterer' | 'quote_sent' | 'quote_approved' | 'in_preparation' | 'ready_for_delivery' | 'delivered' | 'cancelled';
}

export interface OrderEmailDTO {
  recipient: 'client' | 'caterer' | 'both';
  subject?: string;
  message?: string;
  include_pdf?: boolean;
}
