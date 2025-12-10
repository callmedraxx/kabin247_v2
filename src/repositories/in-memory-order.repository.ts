import { Order, OrderItem, OrderSearchParams, OrderListResponse, CreateOrderDTO, UpdateOrderDTO } from '../models/order';
import { OrderRepository } from './order.repository';

export class InMemoryOrderRepository implements OrderRepository {
  private orders: Order[] = [];
  private orderItems: OrderItem[] = [];
  private orderPdfs: Map<number, { pdf_data: Buffer; filename: string; mime_type: string; updated_at?: Date }> = new Map();
  private nextId: number = 1;
  private nextItemId: number = 1;
  private orderNumberCounter: number = 1;

  async getNextOrderNumber(): Promise<string> {
    const orderNumber = `KA${String(this.orderNumberCounter).padStart(6, '0')}`;
    this.orderNumberCounter++;
    return orderNumber;
  }

  async create(orderData: CreateOrderDTO, orderNumber: string): Promise<Order> {
    const now = new Date();
    
    // Calculate subtotal and total
    const subtotal = orderData.items.reduce((sum, item) => sum + item.price, 0);
    const serviceCharge = orderData.service_charge || 0;
    const total = subtotal + serviceCharge;

    const newOrder: Order = {
      id: this.nextId++,
      order_number: orderNumber,
      client_name: orderData.client_name,
      caterer: orderData.caterer,
      airport: orderData.airport,
      aircraft_tail_number: orderData.aircraft_tail_number,
      delivery_date: orderData.delivery_date,
      delivery_time: orderData.delivery_time,
      order_priority: orderData.order_priority,
      payment_method: orderData.payment_method,
      status: 'awaiting_quote',
      description: orderData.description,
      notes: orderData.notes,
      reheating_instructions: orderData.reheating_instructions,
      packaging_instructions: orderData.packaging_instructions,
      dietary_restrictions: orderData.dietary_restrictions,
      service_charge: serviceCharge,
      subtotal,
      total,
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

    // If items are being updated, recalculate subtotal
    if (orderData.items && orderData.items.length > 0) {
      // Delete existing items
      this.orderItems = this.orderItems.filter(item => item.order_id !== id);
      
      // Create new items
      const newItems: OrderItem[] = orderData.items.map((item, idx) => ({
        id: this.nextItemId++,
        order_id: id,
        item_name: item.item_name,
        item_description: item.item_description,
        portion_size: item.portion_size,
        price: item.price,
        sort_order: idx,
      }));
      this.orderItems.push(...newItems);
      
      subtotal = orderData.items.reduce((sum, item) => sum + item.price, 0);
    }

    if (orderData.service_charge !== undefined) {
      serviceCharge = orderData.service_charge;
    }

    const total = subtotal + serviceCharge;

    this.orders[index] = {
      ...existingOrder,
      ...orderData,
      subtotal,
      service_charge: serviceCharge,
      total,
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
