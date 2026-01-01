import { Order, OrderItem, OrderSearchParams, OrderListResponse, CreateOrderDTO, UpdateOrderDTO, getOrderTypeFromAlias, OrderType } from '../models/order';
import { OrderRepository } from './order.repository';

export class InMemoryOrderRepository implements OrderRepository {
  private orders: Order[] = [];
  private orderItems: OrderItem[] = [];
  private orderPdfs: Map<number, { pdf_data: Buffer; filename: string; mime_type: string; updated_at?: Date }> = new Map();
  private nextId: number = 1;
  private nextItemId: number = 1;
  private orderNumberCounter: number = 1;

  async getNextOrderNumber(clientName: string): Promise<string> {
    // Extract initials from client name (e.g., "Mark Savage" -> "MS", "Hannah Bush" -> "HB")
    const getInitials = (name: string): string => {
      if (!name || name.trim().length === 0) return 'XX';
      const parts = name.trim().split(/\s+/);
      if (parts.length === 1) {
        // Single name - use first 2 letters
        return parts[0].substring(0, 2).toUpperCase().padEnd(2, 'X');
      }
      // Multiple names - use first letter of first and last name
      const firstInitial = parts[0].charAt(0).toUpperCase();
      const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
      return `${firstInitial}${lastInitial}`;
    };

    const initials = getInitials(clientName);
    const currentYear = new Date().getFullYear().toString().slice(-2); // Get last 2 digits (e.g., "25")

    // Find the highest order number for the current year (regardless of client initials)
    // Pattern: {INITIALS}{YEAR}{NUMBER} where NUMBER is a global counter per year
    // Match orders that have the pattern: XX25NNN where XX is any 2 letters
    const yearPattern = new RegExp(`^[A-Z]{2}${currentYear}\\d{2,}$`);
    const matchingOrders = this.orders.filter(order => 
      yearPattern.test(order.order_number)
    );

    if (matchingOrders.length === 0) {
      // First order in this year
      return `${initials}${currentYear}01`;
    }

    // Extract the numeric part from existing order numbers and find the max
    // The year is always 2 digits, so we start from position 4 (after 2-letter initials + 2-digit year)
    let maxSequence = 0;
    for (const order of matchingOrders) {
      const numericPart = order.order_number.substring(4);
      const sequence = parseInt(numericPart) || 0;
      if (sequence > maxSequence) {
        maxSequence = sequence;
      }
    }

    const nextSequence = maxSequence + 1;
    
    // Format: {INITIALS}{YEAR}{NUMBER} with number padded to at least 2 digits
    // e.g., MS2501, HB2502, MS2503, ..., MS25619, HB25620
    return `${initials}${currentYear}${String(nextSequence).padStart(2, '0')}`;
  }

  async orderNumberExists(orderNumber: string, excludeOrderId?: number): Promise<boolean> {
    return this.orders.some(order => 
      order.order_number === orderNumber && 
      (excludeOrderId === undefined || order.id !== excludeOrderId)
    );
  }

  async create(orderData: CreateOrderDTO, orderNumber: string): Promise<Order> {
    const now = new Date();
    
    // Calculate subtotal and total
    const subtotal = orderData.items.reduce((sum, item) => sum + item.price, 0);
    const serviceCharge = orderData.service_charge || 0;
    const deliveryFee = orderData.delivery_fee || 0;
    const coordinationFee = orderData.coordination_fee || 0;
    const total = subtotal + serviceCharge + deliveryFee + coordinationFee;

    // Convert order_type alias to full type if needed
    const orderType = getOrderTypeFromAlias(orderData.order_type as string) || (orderData.order_type as OrderType);

    const newOrder: Order = {
      id: this.nextId++,
      order_number: orderNumber,
      client_id: orderData.client_id,
      caterer_id: orderData.caterer_id,
      airport_id: orderData.airport_id,
      fbo_id: orderData.fbo_id,
      client_name: orderData.client_name,
      caterer: orderData.caterer,
      airport: orderData.airport,
      aircraft_tail_number: orderData.aircraft_tail_number,
      delivery_date: orderData.delivery_date,
      delivery_time: orderData.delivery_time,
      order_priority: orderData.order_priority,
      payment_method: orderData.payment_method,
      order_type: orderType,
      status: 'awaiting_quote',
      description: orderData.description,
      notes: orderData.notes,
      reheating_instructions: orderData.reheating_instructions,
      packaging_instructions: orderData.packaging_instructions,
      dietary_restrictions: orderData.dietary_restrictions,
      delivery_fee: deliveryFee,
      service_charge: serviceCharge,
      coordination_fee: coordinationFee,
      subtotal,
      total,
      revision_count: 0,
      created_at: now,
      updated_at: now,
    };

    this.orders.push(newOrder);

    // Create order items
    const items: OrderItem[] = orderData.items.map((item, index) => ({
      id: this.nextItemId++,
      order_id: newOrder.id,
      item_name: item.item_name,
      item_description: item.item_description,
      portion_size: item.portion_size,
      price: item.price,
      category: item.category,
      packaging: item.packaging,
      sort_order: index,
    }));

    this.orderItems.push(...items);
    newOrder.items = items;

    return newOrder;
  }

  async findById(id: number): Promise<Order | null> {
    const order = this.orders.find(o => o.id === id);
    if (!order) return null;

    const items = this.orderItems
      .filter(item => item.order_id === id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    return {
      ...order,
      items,
    };
  }

  async findAll(params: OrderSearchParams): Promise<OrderListResponse> {
    let filtered = [...this.orders];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(order => {
        return (
          order.order_number?.toLowerCase().includes(searchLower) ||
          order.client_name?.toLowerCase().includes(searchLower) ||
          order.caterer?.toLowerCase().includes(searchLower) ||
          order.airport?.toLowerCase().includes(searchLower) ||
          order.aircraft_tail_number?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply status filter
    if (params.status && params.status !== 'all') {
      filtered = filtered.filter(order => order.status === params.status);
    }

    // Apply date range filter
    if (params.start_date) {
      filtered = filtered.filter(order => order.delivery_date >= params.start_date!);
    }
    if (params.end_date) {
      filtered = filtered.filter(order => order.delivery_date <= params.end_date!);
    }

    // Apply client_name filter
    if (params.client_name) {
      filtered = filtered.filter(order => 
        order.client_name?.toLowerCase().includes(params.client_name!.toLowerCase())
      );
    }

    // Apply caterer filter
    if (params.caterer) {
      filtered = filtered.filter(order => 
        order.caterer?.toLowerCase().includes(params.caterer!.toLowerCase())
      );
    }

    // Apply sorting
    const sortBy = params.sortBy || 'created_at';
    const sortOrder = params.sortOrder || 'desc';
    filtered.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = filtered.length;

    // Apply pagination
    const limit = params.limit || 50;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      orders: paginated,
      total,
      page,
      limit,
    };
  }

  async update(id: number, orderData: UpdateOrderDTO): Promise<Order | null> {
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) return null;

    const existingOrder = this.orders[index];
    let subtotal = existingOrder.subtotal;
    let serviceCharge = existingOrder.service_charge;
    let deliveryFee = existingOrder.delivery_fee;
    let coordinationFee = existingOrder.coordination_fee;

    // If items are being updated, recalculate subtotal
    if (orderData.items && orderData.items.length > 0) {
      // Delete existing items
      this.orderItems = this.orderItems.filter(item => item.order_id !== id);
      
      // Create new items with category and packaging
      const newItems: OrderItem[] = orderData.items.map((item, idx) => ({
        id: this.nextItemId++,
        order_id: id,
        menu_item_id: item.menu_item_id,
        item_name: item.item_name,
        item_description: item.item_description,
        portion_size: item.portion_size,
        price: item.price,
        category: item.category,
        packaging: item.packaging,
        sort_order: idx,
      }));
      this.orderItems.push(...newItems);
      
      subtotal = orderData.items.reduce((sum, item) => sum + item.price, 0);
    }

    if (orderData.service_charge !== undefined) {
      serviceCharge = orderData.service_charge;
    }

    if (orderData.delivery_fee !== undefined) {
      deliveryFee = orderData.delivery_fee;
    }

    if (orderData.coordination_fee !== undefined) {
      coordinationFee = orderData.coordination_fee;
    }

    const total = subtotal + serviceCharge + deliveryFee + coordinationFee;

    // Convert order_type alias to full type if needed
    let orderType = existingOrder.order_type;
    if (orderData.order_type !== undefined) {
      orderType = getOrderTypeFromAlias(orderData.order_type as string) || (orderData.order_type as OrderType);
    }

    // Clear cached PDF since order data has changed
    this.orderPdfs.delete(id);

    // Update reference IDs if provided
    const client_id = orderData.client_id !== undefined ? orderData.client_id : existingOrder.client_id;
    const caterer_id = orderData.caterer_id !== undefined ? orderData.caterer_id : existingOrder.caterer_id;
    const airport_id = orderData.airport_id !== undefined ? orderData.airport_id : existingOrder.airport_id;
    const fbo_id = orderData.fbo_id !== undefined ? orderData.fbo_id : existingOrder.fbo_id;

    this.orders[index] = {
      ...existingOrder,
      ...orderData,
      client_id,
      caterer_id,
      airport_id,
      fbo_id: fbo_id || undefined,
      order_type: orderType,
      subtotal,
      service_charge: serviceCharge,
      delivery_fee: deliveryFee,
      coordination_fee: coordinationFee,
      total,
      revision_count: (existingOrder.revision_count || 0) + 1,
      updated_at: new Date(),
    };

    return this.findById(id);
  }

  async updateStatus(id: number, status: string): Promise<Order | null> {
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) return null;

    const now = new Date();
    this.orders[index] = {
      ...this.orders[index],
      status: status as any,
      updated_at: now,
      completed_at: (status === 'delivered' || status === 'cancelled') ? now : this.orders[index].completed_at,
    };

    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    const index = this.orders.findIndex(o => o.id === id);
    if (index === -1) return false;

    this.orders.splice(index, 1);
    this.orderItems = this.orderItems.filter(item => item.order_id !== id);
    return true;
  }

  async deleteMany(ids: number[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  async count(): Promise<number> {
    return this.orders.length;
  }

  async savePdf(orderId: number, buffer: Buffer, filename: string, mimeType: string): Promise<void> {
    this.orderPdfs.set(orderId, {
      pdf_data: buffer,
      filename,
      mime_type: mimeType,
      updated_at: new Date(),
    });
  }

  async getPdf(orderId: number): Promise<{ pdf_data: Buffer; filename: string; mime_type: string; updated_at?: Date } | null> {
    return this.orderPdfs.get(orderId) || null;
  }
}
