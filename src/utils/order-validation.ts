import { CreateOrderDTO, UpdateOrderDTO } from '../models/order';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateOrder(order: CreateOrderDTO | UpdateOrderDTO): ValidationResult {
  const errors: string[] = [];

  // Validate required fields for CreateOrderDTO
  if ('client_name' in order && !order.client_name) {
    errors.push('client_name is required');
  }
  if ('caterer' in order && !order.caterer) {
    errors.push('caterer is required');
  }
  if ('airport' in order && !order.airport) {
    errors.push('airport is required');
  }
  if ('delivery_date' in order && !order.delivery_date) {
    errors.push('delivery_date is required');
  }
  if ('delivery_time' in order && !order.delivery_time) {
    errors.push('delivery_time is required');
  }
  if ('order_priority' in order && !order.order_priority) {
    errors.push('order_priority is required');
  }
  if ('payment_method' in order && !order.payment_method) {
    errors.push('payment_method is required');
  }

  // Validate order_priority enum
  if ('order_priority' in order && order.order_priority) {
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (!validPriorities.includes(order.order_priority)) {
      errors.push(`order_priority must be one of: ${validPriorities.join(', ')}`);
    }
  }

  // Validate payment_method enum
  if ('payment_method' in order && order.payment_method) {
    const validMethods = ['card', 'ACH'];
    if (!validMethods.includes(order.payment_method)) {
      errors.push(`payment_method must be one of: ${validMethods.join(', ')}`);
    }
  }

  // Validate order_type (required for CreateOrderDTO)
  if ('order_type' in order) {
    const validOrderTypes = ['QE', 'Serv', 'Hub'];
    if (!order.order_type) {
      // Only require order_type for create (when client_name is present)
      if ('client_name' in order) {
        errors.push('order_type is required');
      }
    } else if (!validOrderTypes.includes(order.order_type)) {
      errors.push(`order_type must be one of: ${validOrderTypes.join(', ')}`);
    }
  }

  // Validate delivery_fee
  if ('delivery_fee' in order && order.delivery_fee !== undefined) {
    if (typeof order.delivery_fee !== 'number' || order.delivery_fee < 0) {
      errors.push('delivery_fee must be a non-negative number');
    }
  }

  // Validate status enum (for UpdateOrderDTO)
  if ('status' in order && order.status) {
    const validStatuses = ['awaiting_quote', 'awaiting_caterer', 'quote_sent', 'quote_approved', 'in_preparation', 'ready_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(order.status)) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }
  }

  // Validate delivery_date format (YYYY-MM-DD)
  if ('delivery_date' in order && order.delivery_date) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(order.delivery_date)) {
      errors.push('delivery_date must be in format YYYY-MM-DD');
    } else {
      const date = new Date(order.delivery_date);
      if (isNaN(date.getTime())) {
        errors.push('delivery_date must be a valid date');
      }
    }
  }

  // Validate delivery_time format (HH:mm)
  if ('delivery_time' in order && order.delivery_time) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(order.delivery_time)) {
      errors.push('delivery_time must be in format HH:mm (24-hour format)');
    }
  }

  // Validate service_charge
  if ('service_charge' in order && order.service_charge !== undefined) {
    if (typeof order.service_charge !== 'number' || order.service_charge < 0) {
      errors.push('service_charge must be a non-negative number');
    }
  }

  // Validate items (required for CreateOrderDTO, optional for UpdateOrderDTO)
  if ('items' in order && order.items !== undefined) {
    if (!Array.isArray(order.items)) {
      errors.push('items must be an array');
    } else if (order.items.length === 0 && 'client_name' in order) {
      // Only require items for CreateOrderDTO
      errors.push('At least one item is required');
    } else {
      order.items.forEach((item, index) => {
        if (!item.item_name) {
          errors.push(`items[${index}].item_name is required`);
        }
        if (!item.portion_size) {
          errors.push(`items[${index}].portion_size is required`);
        }
        if (item.price === undefined || item.price === null) {
          errors.push(`items[${index}].price is required`);
        } else if (typeof item.price !== 'number' || item.price <= 0) {
          errors.push(`items[${index}].price must be a positive number`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeOrderData(order: CreateOrderDTO | UpdateOrderDTO): CreateOrderDTO | UpdateOrderDTO {
  const normalized = { ...order };

  // Normalize strings (trim whitespace)
  if ('client_name' in normalized && normalized.client_name) {
    normalized.client_name = normalized.client_name.trim();
  }
  if ('caterer' in normalized && normalized.caterer) {
    normalized.caterer = normalized.caterer.trim();
  }
  if ('airport' in normalized && normalized.airport) {
    normalized.airport = normalized.airport.trim();
  }
  if ('aircraft_tail_number' in normalized && normalized.aircraft_tail_number) {
    normalized.aircraft_tail_number = normalized.aircraft_tail_number.trim().toUpperCase();
  }

  // Normalize service_charge to 0 if undefined
  if ('service_charge' in normalized && normalized.service_charge === undefined) {
    normalized.service_charge = 0;
  }

  // Normalize delivery_fee to 0 if undefined
  if ('delivery_fee' in normalized && normalized.delivery_fee === undefined) {
    normalized.delivery_fee = 0;
  }

  return normalized;
}
