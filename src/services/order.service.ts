import { Order, CreateOrderDTO, UpdateOrderDTO, OrderSearchParams, OrderListResponse, OrderStatusUpdateDTO, CreateOrderFromRefsDTO } from '../models/order';
import { getOrderRepository, getClientRepository, getCatererRepository, getAirportRepository, getMenuItemRepository, getFBORepository } from '../repositories';
import { validateOrder, normalizeOrderData } from '../utils/order-validation';
import { Logger } from '../utils/logger';
import { generateOrderPDFBuffer, generateOrderPDFBBuffer } from '../utils/order-pdf';

export class OrderService {
  private repository = getOrderRepository();
  private clientRepository = getClientRepository();
  private catererRepository = getCatererRepository();
  private airportRepository = getAirportRepository();
  private menuItemRepository = getMenuItemRepository();
  private fboRepository = getFBORepository();

  /**
   * Resolve prices for order items based on caterer-specific pricing
   * Falls back to base variant price if caterer-specific price is not available
   */
  private async resolveOrderItemPrices(
    items: CreateOrderDTO['items'],
    catererId: number | null | undefined
  ): Promise<CreateOrderDTO['items']> {
    const resolvedItems = await Promise.all(
      items.map(async (item) => {
        // Only resolve price if menu_item_id and portion_size are provided
        if (item.menu_item_id && item.portion_size) {
          // Get menu item to find the variant
          const menuItem = await this.menuItemRepository.findById(item.menu_item_id);
          if (menuItem && menuItem.variants) {
            // Find variant matching portion_size
            const variant = menuItem.variants.find(
              (v) => v.portion_size === item.portion_size
            );
            
            if (variant && variant.id) {
              // Get price using caterer_id (can be null)
              const resolvedPrice = await this.menuItemRepository.getPriceForVariant(
                variant.id,
                catererId ?? null
              );
              
              if (resolvedPrice !== null) {
                // Use resolved price if it's available
                // Only override if price wasn't explicitly provided or if we want to always use resolved price
                // For now, we'll use resolved price if price is 0 or not set, otherwise keep provided price
                if (!item.price || item.price === 0) {
                  return {
                    ...item,
                    price: resolvedPrice,
                  };
                }
              }
            }
          }
        }
        
        // Return item as-is if price resolution not needed or not possible
        return item;
      })
    );
    
    return resolvedItems;
  }

  async createOrder(data: CreateOrderDTO): Promise<Order> {
    const normalized = normalizeOrderData(data) as CreateOrderDTO;
    
    // Auto-fill FBO details if fbo_id is provided
    if (normalized.fbo_id) {
      const fbo = await this.fboRepository.findById(normalized.fbo_id);
      if (!fbo) {
        throw new Error(`FBO not found: ${normalized.fbo_id}`);
      }
      // FBO details will be populated in repository
    }
    
    // Resolve prices for order items based on caterer
    if (normalized.items && normalized.items.length > 0) {
      normalized.items = await this.resolveOrderItemPrices(normalized.items, normalized.caterer_id);
    }
    
    const validation = validateOrder(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Use provided order_number or generate one automatically
    let orderNumber: string;
    // Check if order_number was provided (from original data) and is not empty after normalization
    const providedOrderNumber = data.order_number !== undefined && data.order_number !== null 
      ? String(data.order_number).trim() 
      : null;
    
    if (providedOrderNumber && providedOrderNumber.length > 0) {
      // Validate uniqueness if order_number is provided
      const exists = await this.repository.orderNumberExists(providedOrderNumber);
      if (exists) {
        throw new Error(`Order number ${providedOrderNumber} already exists`);
      }
      orderNumber = providedOrderNumber;
      Logger.info('Using provided order number', { orderNumber, original: data.order_number });
    } else {
      // Generate order number automatically based on client name
      const clientName = normalized.client_name || '';
      if (!clientName) {
        throw new Error('Client name is required to generate order number');
      }
      orderNumber = await this.repository.getNextOrderNumber(clientName);
      Logger.info('Auto-generated order number', { orderNumber, clientName, provided: data.order_number });
    }

    const order = await this.repository.create(normalized, orderNumber);
    
    // Auto-generate and save PDF after order creation
    try {
      const pdfBuffer = await generateOrderPDFBuffer(order);
      const filename = `order_${order.order_number}.pdf`;
      await this.repository.savePdf(order.id!, pdfBuffer, filename, 'application/pdf');
    } catch (error) {
      Logger.error('Failed to generate PDF after order creation', { orderId: order.id, error });
      // Don't fail order creation if PDF generation fails
    }
    
    return order;
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

      // Find variant to resolve price
      let resolvedPrice = item.price;
      if (menuItem.variants && item.portion_size) {
        const variant = menuItem.variants.find(
          (v) => v.portion_size === item.portion_size
        );
        
        if (variant && variant.id) {
          const variantPrice = await this.menuItemRepository.getPriceForVariant(
            variant.id,
            data.caterer_id ?? null
          );
          
          // Use resolved price if available and no explicit price provided
          if (variantPrice !== null && (!item.price || item.price === 0)) {
            resolvedPrice = variantPrice;
          } else if (variantPrice !== null) {
            // Optionally use resolved price even if provided (for validation/consistency)
            resolvedPrice = item.price;
          }
        }
      }

      mappedItems.push({
        menu_item_id: item.item_id,
        item_name: menuItem.item_name,
        item_description: item.item_description ?? menuItem.item_description ?? undefined,
        portion_size: item.portion_size,
        price: resolvedPrice,
        category: item.category ?? undefined,
        packaging: item.packaging ?? undefined,
      });
    }

    // Fetch FBO if fbo_id is provided
    if (data.fbo_id) {
      const fbo = await this.fboRepository.findById(data.fbo_id);
      if (!fbo) {
        throw new Error(`FBO not found: ${data.fbo_id}`);
      }
    }

    const createPayload: CreateOrderDTO = {
      client_id: data.client_id,
      caterer_id: data.caterer_id,
      airport_id: data.airport_id,
      fbo_id: data.fbo_id,
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
    
    // Get existing order to check if caterer_id is being changed
    const existingOrder = await this.repository.findById(id);
    if (!existingOrder) {
      return null;
    }
    
    // Determine the caterer_id to use for price resolution
    const catererIdForPricing = normalized.caterer_id !== undefined 
      ? normalized.caterer_id 
      : existingOrder.caterer_id;
    
    // If reference IDs are being changed, fetch new entities and update display names
    if (normalized.client_id !== undefined) {
      const client = await this.clientRepository.findById(normalized.client_id);
      if (!client) {
        throw new Error(`Client not found: ${normalized.client_id}`);
      }
      normalized.client_name = client.full_name;
    }

    if (normalized.caterer_id !== undefined) {
      const caterer = await this.catererRepository.findById(normalized.caterer_id);
      if (!caterer) {
        throw new Error(`Caterer not found: ${normalized.caterer_id}`);
      }
      normalized.caterer = [caterer.caterer_name, caterer.caterer_number].filter(Boolean).join(' - ');
    }

    if (normalized.airport_id !== undefined) {
      const airport = await this.airportRepository.findById(normalized.airport_id);
      if (!airport) {
        throw new Error(`Airport not found: ${normalized.airport_id}`);
      }
      const airportCode = airport.airport_code_iata || airport.airport_code_icao;
      normalized.airport = airportCode
        ? `${airport.airport_name} (${airportCode})`
        : airport.airport_name;
    }

    if (normalized.fbo_id !== undefined && normalized.fbo_id !== null) {
      const fbo = await this.fboRepository.findById(normalized.fbo_id);
      if (!fbo) {
        throw new Error(`FBO not found: ${normalized.fbo_id}`);
      }
    }
    
    // Resolve prices for order items if items are being updated or caterer_id changed
    if (normalized.items && normalized.items.length > 0) {
      normalized.items = await this.resolveOrderItemPrices(normalized.items, catererIdForPricing);
    } else if (normalized.caterer_id !== undefined && existingOrder.items && existingOrder.items.length > 0) {
      // If caterer is being changed but items aren't explicitly updated,
      // we could optionally re-resolve prices, but that would require fetching items
      // For now, we'll only resolve prices when items are explicitly provided
    }
    
    // Validate order_number uniqueness if it's being updated
    if (normalized.order_number !== undefined) {
      const exists = await this.repository.orderNumberExists(normalized.order_number, id);
      if (exists) {
        throw new Error(`Order number ${normalized.order_number} already exists`);
      }
    }

    // Validate only provided fields
    if (Object.keys(normalized).length > 0) {
      const validation = validateOrder(normalized);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
    }

    const updatedOrder = await this.repository.update(id, normalized);
    
    // Auto-regenerate and save PDF after order update
    if (updatedOrder) {
      try {
        const pdfBuffer = await generateOrderPDFBuffer(updatedOrder);
        const filename = `order_${updatedOrder.order_number}.pdf`;
        await this.repository.savePdf(updatedOrder.id!, pdfBuffer, filename, 'application/pdf');
      } catch (error) {
        Logger.error('Failed to regenerate PDF after order update', { orderId: id, error });
        // Don't fail order update if PDF generation fails
      }
    }
    
    return updatedOrder;
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

    // Business rule: Can't go from delivered/cancelled back to other statuses (except order_changed which can happen anytime)
    if ((existingOrder.status === 'delivered' || existingOrder.status === 'cancelled') 
        && statusData.status !== 'delivered' && statusData.status !== 'cancelled' && statusData.status !== 'order_changed') {
      throw new Error(`Cannot change status from ${existingOrder.status} to ${statusData.status}`);
    }

    const updatedOrder = await this.repository.updateStatus(id, statusData.status);
    
    // Auto-regenerate and save PDF after status update
    if (updatedOrder) {
      try {
        const pdfBuffer = await generateOrderPDFBuffer(updatedOrder);
        const filename = `order_${updatedOrder.order_number}.pdf`;
        await this.repository.savePdf(updatedOrder.id!, pdfBuffer, filename, 'application/pdf');
      } catch (error) {
        Logger.error('Failed to regenerate PDF after status update', { orderId: id, error });
        // Don't fail status update if PDF generation fails
      }
    }
    
    return updatedOrder;
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
        // Check if order was updated after PDF was generated - if so, regenerate
        const orderUpdatedAt = order.updated_at ? new Date(order.updated_at).getTime() : 0;
        const pdfUpdatedAt = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
        const now = Date.now();
        
        // For orders with client_id or airport_id, regenerate if PDF is older than 1 hour
        // This ensures PDFs have the latest joined data after code fixes
        const hasReferences = !!(order.client_id || order.airport_id);
        const pdfAge = now - pdfUpdatedAt;
        const oneHour = 3600000; // 1 hour in milliseconds
        
        // Use cached PDF only if:
        // 1. PDF is newer than or equal to order's last update, AND
        // 2. If order has references, PDF must be less than 1 hour old
        if (pdfUpdatedAt >= orderUpdatedAt && (!hasReferences || pdfAge < oneHour)) {
          return {
            buffer: existing.pdf_data,
            filename: existing.filename || filename,
            mimeType: existing.mime_type || mimeType,
            order,
          };
        }
        // Need to regenerate, fall through
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

  async getOrCreateOrderPdfB(orderId: number, recipientType: 'client' | 'caterer' = 'caterer'): Promise<{ buffer: Buffer; filename: string; mimeType: string; order: Order }> {
    const order = await this.repository.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // PDF B is always generated fresh (not cached) as it's typically for vendor/caterer
    const filename = recipientType === 'client' 
      ? `order_${order.order_number}.pdf`
      : `order_${order.order_number}_vendor.pdf`;
    const mimeType = 'application/pdf';

    // Generate PDF B (no pricing, grouped by category)
    const pdfBuffer = await generateOrderPDFBBuffer(order, recipientType);

    return {
      buffer: pdfBuffer,
      filename,
      mimeType,
      order,
    };
  }
}
