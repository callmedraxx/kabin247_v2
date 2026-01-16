import { Order, OrderSearchParams, OrderListResponse, CreateOrderDTO, UpdateOrderDTO } from '../models/order';

export interface OrderRepository {
  create(order: CreateOrderDTO, orderNumber: string): Promise<Order>;
  findById(id: number): Promise<Order | null>;
  findAll(params: OrderSearchParams): Promise<OrderListResponse>;
  update(id: number, order: UpdateOrderDTO): Promise<Order | null>;
  updateStatus(id: number, status: string): Promise<Order | null>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: number[]): Promise<number>;
  getNextOrderNumber(clientName: string): Promise<string>;
  orderNumberExists(orderNumber: string, excludeOrderId?: number): Promise<boolean>;
  count(): Promise<number>;
  savePdf(orderId: number, buffer: Buffer, filename: string, mimeType: string): Promise<void>;
  getPdf(orderId: number): Promise<{ pdf_data: Buffer; filename: string; mime_type: string; updated_at?: Date } | null>;
  incrementRevisionCount(id: number): Promise<Order | null>;
}
