export interface OrderItem {
  id?: number;
  order_id?: number;
  item_name: string;
  item_description?: string;
  portion_size: string;
  price: number;
  sort_order?: number;
}

export interface Order {
  id?: number;
  order_number: string;
  client_name: string;
  caterer: string;
  airport: string;
  aircraft_tail_number?: string;
  delivery_date: string; // ISO 8601 date format: YYYY-MM-DD
  delivery_time: string; // Time format: HH:mm
  order_priority: 'low' | 'normal' | 'high' | 'urgent';
  payment_method: 'card' | 'ACH';
  status: 'awaiting_quote' | 'awaiting_caterer' | 'quote_sent' | 'quote_approved' | 'in_preparation' | 'ready_for_delivery' | 'delivered' | 'cancelled';
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  service_charge: number;
  subtotal: number;
  total: number;
  items?: OrderItem[];
  created_at?: Date;
  updated_at?: Date;
  completed_at?: Date;
}

export interface CreateOrderDTO {
  client_name: string;
  caterer: string;
  airport: string;
  aircraft_tail_number?: string;
  delivery_date: string;
  delivery_time: string;
  order_priority: 'low' | 'normal' | 'high' | 'urgent';
  payment_method: 'card' | 'ACH';
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
  service_charge?: number;
  items: Array<{
    item_name: string;
    item_description?: string;
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
  description?: string;
  notes?: string;
  reheating_instructions?: string;
  packaging_instructions?: string;
  dietary_restrictions?: string;
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
