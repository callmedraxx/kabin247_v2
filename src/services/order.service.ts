import { Order, CreateOrderDTO, UpdateOrderDTO, OrderSearchParams, OrderListResponse, OrderStatusUpdateDTO } from '../models/order';
import { getOrderRepository } from '../repositories';
import { validateOrder, normalizeOrderData } from '../utils/order-validation';
import { Logger } from '../utils/logger';
import { generateOrderPDFBuffer } from '../utils/order-pdf';

export class OrderService {
  private repository = getOrderRepository();

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
