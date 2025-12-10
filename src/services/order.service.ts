import { Order, CreateOrderDTO, UpdateOrderDTO, OrderSearchParams, OrderListResponse, OrderStatusUpdateDTO, CreateOrderFromRefsDTO } from '../models/order';
import { getOrderRepository, getClientRepository, getCatererRepository, getAirportRepository, getMenuItemRepository } from '../repositories';
import { validateOrder, normalizeOrderData } from '../utils/order-validation';
import { Logger } from '../utils/logger';
import { generateOrderPDFBuffer } from '../utils/order-pdf';

export class OrderService {
  private repository = getOrderRepository();
  private clientRepository = getClientRepository();
  private catererRepository = getCatererRepository();
  private airportRepository = getAirportRepository();
  private menuItemRepository = getMenuItemRepository();

  async createOrder(data: CreateOrderDTO): Promise<Order> {
    const normalized = normalizeOrderData(data) as CreateOrderDTO;
    const validation = validateOrder(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate order number
    const orderNumber = await this.repository.getNextOrderNumber();

    return this.repository.create(normalized, orderNumber);
  }

  async createOrderFromReferences(data: CreateOrderFromRefsDTO): Promise<Order> {
    // Fetch referenced entities
    const client = await this.clientRepository.findById(data.client_id);
    if (!client) {
      throw new Error(`Client not found: ${data.client_id}`);
    }

    const caterer = await this.catererRepository.findById(data.caterer_id);
    if (!caterer) {
      throw new Error(`Caterer not found: ${data.caterer_id}`);
    }

    const airport = await this.airportRepository.findById(data.airport_id);
    if (!airport) {
      throw new Error(`Airport not found: ${data.airport_id}`);
    }

    // Build display strings using fetched details
    const clientName = client.full_name;
    const catererDisplay = [caterer.caterer_name, caterer.caterer_number].filter(Boolean).join(' - ');
    const airportCode = airport.airport_code_iata || airport.airport_code_icao;
    const airportDisplay = airportCode
      ? `${airport.airport_name} (${airportCode})`
      : airport.airport_name;

    // Map items from menu item references
    const mappedItems: CreateOrderDTO['items'] = [];
    for (const item of data.items) {
      const menuItem = await this.menuItemRepository.findById(item.item_id);
      if (!menuItem) {
        throw new Error(`Menu item not found: ${item.item_id}`);
      }

      mappedItems.push({
        menu_item_id: item.item_id,
        item_name: menuItem.item_name,
        item_description: item.item_description ?? menuItem.item_description ?? undefined,
        portion_size: item.portion_size,
        price: item.price,
      });
    }

    const createPayload: CreateOrderDTO = {
      client_id: data.client_id,
      caterer_id: data.caterer_id,
      airport_id: data.airport_id,
      client_name: clientName,
      caterer: catererDisplay,
      airport: airportDisplay,
      aircraft_tail_number: data.aircraft_tail_number,
      delivery_date: data.delivery_date,
      delivery_time: data.delivery_time,
      order_priority: data.order_priority,
      payment_method: data.payment_method,
      order_type: data.order_type,
      description: data.description,
      notes: data.notes,
      reheating_instructions: data.reheating_instructions,
      packaging_instructions: data.packaging_instructions,
      dietary_restrictions: data.dietary_restrictions,
      delivery_fee: data.delivery_fee,
      service_charge: data.service_charge,
      items: mappedItems,
    };

    return this.createOrder(createPayload);
  }

  async getOrderById(id: number): Promise<Order | null> {
    return this.repository.findById(id);
  }

  async listOrders(params: OrderSearchParams): Promise<OrderListResponse> {
    return this.repository.findAll(params);
  }

  async updateOrder(id: number, data: UpdateOrderDTO): Promise<Order | null> {
    const normalized = normalizeOrderData(data) as UpdateOrderDTO;
    
    // Validate only provided fields
    if (Object.keys(normalized).length > 0) {
      const validation = validateOrder(normalized);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
    }

    return this.repository.update(id, normalized);
  }

  async updateOrderStatus(id: number, statusData: OrderStatusUpdateDTO): Promise<Order | null> {
    const validation = validateOrder(statusData);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Validate status transitions
    const existingOrder = await this.repository.findById(id);
    if (!existingOrder) {
      return null;
    }

    // Business rule: Can't go from delivered/cancelled back to other statuses
    if ((existingOrder.status === 'delivered' || existingOrder.status === 'cancelled') 
        && statusData.status !== 'delivered' && statusData.status !== 'cancelled') {
      throw new Error(`Cannot change status from ${existingOrder.status} to ${statusData.status}`);
    }

    return this.repository.updateStatus(id, statusData.status);
  }

  async deleteOrder(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteOrders(ids: number[]): Promise<number> {
    return this.repository.deleteMany(ids);
  }

  async getOrderHistory(params: OrderSearchParams): Promise<OrderListResponse> {
    // History endpoint can have additional filters like date range
    return this.repository.findAll(params);
  }

  async getOrCreateOrderPdf(orderId: number, regenerate: boolean = false): Promise<{ buffer: Buffer; filename: string; mimeType: string; order: Order }> {
    const order = await this.repository.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const filename = `order_${order.order_number}.pdf`;
    const mimeType = 'application/pdf';

    if (!regenerate) {
      const existing = await this.repository.getPdf(orderId);
      if (existing) {
        return {
          buffer: existing.pdf_data,
          filename: existing.filename || filename,
          mimeType: existing.mime_type || mimeType,
          order,
        };
      }
    }

    // Generate and store
    const pdfBuffer = await generateOrderPDFBuffer(order);
    await this.repository.savePdf(orderId, pdfBuffer, filename, mimeType);

    return {
      buffer: pdfBuffer,
      filename,
      mimeType,
      order,
    };
  }
}
