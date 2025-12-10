import { DatabaseAdapter } from '../database/adapter';
import { Order, OrderItem, OrderSearchParams, OrderListResponse, CreateOrderDTO, UpdateOrderDTO } from '../models/order';
import { OrderRepository } from './order.repository';

export class PostgreSQLOrderRepository implements OrderRepository {
  constructor(private db: DatabaseAdapter) {}

  async getNextOrderNumber(): Promise<string> {
    // Get the highest order number starting with KA
    const query = `
      SELECT order_number FROM orders
      WHERE order_number LIKE 'KA%'
      ORDER BY CAST(SUBSTRING(order_number FROM 3) AS INTEGER) DESC
      LIMIT 1
    `;
    const result = await this.db.query(query);
    
    if (result.rows.length === 0) {
      return 'KA000001';
    }
    
    const lastOrderNumber = result.rows[0].order_number;
    // Extract the numeric part after 'KA'
    const numericPart = lastOrderNumber.substring(2);
    const lastSequence = parseInt(numericPart) || 0;
    const nextSequence = lastSequence + 1;
    
    return `KA${String(nextSequence).padStart(6, '0')}`;
  }

  async create(orderData: CreateOrderDTO, orderNumber: string): Promise<Order> {
    // Calculate subtotal and total
    const subtotal = orderData.items.reduce((sum, item) => sum + item.price, 0);
    const serviceCharge = orderData.service_charge || 0;
    const total = subtotal + serviceCharge;

    // Insert order
    const orderQuery = `
      INSERT INTO orders (
        order_number, client_name, caterer, airport, aircraft_tail_number,
        delivery_date, delivery_time, order_priority, payment_method, status,
        description, notes, reheating_instructions, packaging_instructions,
        dietary_restrictions, service_charge, subtotal, total,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
      RETURNING *
    `;
    
    const orderResult = await this.db.query(orderQuery, [
      orderNumber,
      orderData.client_name,
      orderData.caterer,
      orderData.airport,
      orderData.aircraft_tail_number || null,
      orderData.delivery_date,
      orderData.delivery_time,
      orderData.order_priority,
      orderData.payment_method,
      'awaiting_quote',
      orderData.description || null,
      orderData.notes || null,
      orderData.reheating_instructions || null,
      orderData.packaging_instructions || null,
      orderData.dietary_restrictions || null,
      serviceCharge,
      subtotal,
      total,
    ]);

    const order = orderResult.rows[0];

    // Insert order items
    const items: OrderItem[] = [];
    for (let i = 0; i < orderData.items.length; i++) {
      const item = orderData.items[i];
      const itemQuery = `
        INSERT INTO order_items (
          order_id, item_name, item_description, portion_size, price, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;
      const itemResult = await this.db.query(itemQuery, [
        order.id,
        item.item_name,
        item.item_description || null,
        item.portion_size,
        item.price,
        i,
      ]);
      items.push(itemResult.rows[0]);
    }

    return {
      ...order,
      items,
    };
  }

  async findById(id: number): Promise<Order | null> {
    const orderQuery = 'SELECT * FROM orders WHERE id = $1';
    const orderResult = await this.db.query(orderQuery, [id]);
    
    if (orderResult.rows.length === 0) {
      return null;
    }

    const order = orderResult.rows[0];

    // Get order items
    const itemsQuery = `
      SELECT * FROM order_items
      WHERE order_id = $1
      ORDER BY sort_order ASC, id ASC
    `;
    const itemsResult = await this.db.query(itemsQuery, [id]);
    order.items = itemsResult.rows;

    return order;
  }

  async findAll(params: OrderSearchParams): Promise<OrderListResponse> {
    const limit = params.limit || 50;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    
    let whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Build WHERE clause for search
    if (params.search) {
      whereConditions.push(`(
        order_number ILIKE $${paramIndex} OR
        client_name ILIKE $${paramIndex} OR
        caterer ILIKE $${paramIndex} OR
        airport ILIKE $${paramIndex} OR
        aircraft_tail_number ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    // Apply status filter
    if (params.status && params.status !== 'all') {
      whereConditions.push(`status = $${paramIndex}`);
      queryParams.push(params.status);
      paramIndex++;
    }

    // Apply date range filter
    if (params.start_date) {
      whereConditions.push(`delivery_date >= $${paramIndex}`);
      queryParams.push(params.start_date);
      paramIndex++;
    }
    if (params.end_date) {
      whereConditions.push(`delivery_date <= $${paramIndex}`);
      queryParams.push(params.end_date);
      paramIndex++;
    }

    // Apply client_name filter
    if (params.client_name) {
      whereConditions.push(`client_name ILIKE $${paramIndex}`);
      queryParams.push(`%${params.client_name}%`);
      paramIndex++;
    }

    // Apply caterer filter
    if (params.caterer) {
      whereConditions.push(`caterer ILIKE $${paramIndex}`);
      queryParams.push(`%${params.caterer}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Build ORDER BY clause with SQL injection protection
    const allowedSortFields = ['id', 'order_number', 'client_name', 'caterer', 'airport', 'delivery_date', 'created_at', 'updated_at', 'status'];
    const sortBy = allowedSortFields.includes(params.sortBy || '') ? params.sortBy : 'created_at';
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const orderBy = `ORDER BY ${sortBy} ${sortOrder}`;

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM orders ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Data query
    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT * FROM orders
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    return {
      orders: result.rows,
      total,
      page,
      limit,
    };
  }

  async update(id: number, orderData: UpdateOrderDTO): Promise<Order | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build update fields
    if (orderData.client_name !== undefined) {
      updates.push(`client_name = $${paramIndex++}`);
      values.push(orderData.client_name);
    }
    if (orderData.caterer !== undefined) {
      updates.push(`caterer = $${paramIndex++}`);
      values.push(orderData.caterer);
    }
    if (orderData.airport !== undefined) {
      updates.push(`airport = $${paramIndex++}`);
      values.push(orderData.airport);
    }
    if (orderData.aircraft_tail_number !== undefined) {
      updates.push(`aircraft_tail_number = $${paramIndex++}`);
      values.push(orderData.aircraft_tail_number || null);
    }
    if (orderData.delivery_date !== undefined) {
      updates.push(`delivery_date = $${paramIndex++}`);
      values.push(orderData.delivery_date);
    }
    if (orderData.delivery_time !== undefined) {
      updates.push(`delivery_time = $${paramIndex++}`);
      values.push(orderData.delivery_time);
    }
    if (orderData.order_priority !== undefined) {
      updates.push(`order_priority = $${paramIndex++}`);
      values.push(orderData.order_priority);
    }
    if (orderData.payment_method !== undefined) {
      updates.push(`payment_method = $${paramIndex++}`);
      values.push(orderData.payment_method);
    }
    if (orderData.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(orderData.status);
    }
    if (orderData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(orderData.description || null);
    }
    if (orderData.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(orderData.notes || null);
    }
    if (orderData.reheating_instructions !== undefined) {
      updates.push(`reheating_instructions = $${paramIndex++}`);
      values.push(orderData.reheating_instructions || null);
    }
    if (orderData.packaging_instructions !== undefined) {
      updates.push(`packaging_instructions = $${paramIndex++}`);
      values.push(orderData.packaging_instructions || null);
    }
    if (orderData.dietary_restrictions !== undefined) {
      updates.push(`dietary_restrictions = $${paramIndex++}`);
      values.push(orderData.dietary_restrictions || null);
    }
    if (orderData.service_charge !== undefined) {
      updates.push(`service_charge = $${paramIndex++}`);
      values.push(orderData.service_charge);
    }

    // Handle items update
    if (orderData.items && orderData.items.length > 0) {
      // Delete existing items
      await this.db.query('DELETE FROM order_items WHERE order_id = $1', [id]);
      
      // Insert new items
      for (let i = 0; i < orderData.items.length; i++) {
        const item = orderData.items[i];
        await this.db.query(
          `INSERT INTO order_items (order_id, item_name, item_description, portion_size, price, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            item.item_name,
            item.item_description || null,
            item.portion_size,
            item.price,
            i,
          ]
        );
      }
    }

    // Recalculate subtotal and total if items or service_charge changed
    if (orderData.items || orderData.service_charge !== undefined) {
      const itemsQuery = 'SELECT SUM(price) as subtotal FROM order_items WHERE order_id = $1';
      const itemsResult = await this.db.query(itemsQuery, [id]);
      const subtotal = parseFloat(itemsResult.rows[0].subtotal || '0');
      
      const orderResult = await this.db.query('SELECT service_charge FROM orders WHERE id = $1', [id]);
      const serviceCharge = orderData.service_charge !== undefined 
        ? orderData.service_charge 
        : parseFloat(orderResult.rows[0].service_charge || '0');
      
      updates.push(`subtotal = $${paramIndex++}`);
      values.push(subtotal);
      updates.push(`total = $${paramIndex++}`);
      values.push(subtotal + serviceCharge);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const query = `
      UPDATE orders
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    const result = await this.db.query(query, values);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.findById(id);
  }

  async updateStatus(id: number, status: string): Promise<Order | null> {
    const shouldSetCompletedAt = status === 'delivered' || status === 'cancelled';
    
    let query: string;
    if (shouldSetCompletedAt) {
      query = `
        UPDATE orders
        SET status = $1, updated_at = NOW(), completed_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
    } else {
      query = `
        UPDATE orders
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
    }
    
    const result = await this.db.query(query, [status, id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.findById(id);
  }

  async delete(id: number): Promise<boolean> {
    // Order items will be cascade deleted
    const query = 'DELETE FROM orders WHERE id = $1';
    const result = await this.db.query(query, [id]);
    return result.rowCount > 0;
  }

  async deleteMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const query = `DELETE FROM orders WHERE id IN (${placeholders})`;
    const result = await this.db.query(query, ids);
    return result.rowCount || 0;
  }

  async count(): Promise<number> {
    const query = 'SELECT COUNT(*) as total FROM orders';
    const result = await this.db.query(query);
    return parseInt(result.rows[0].total);
  }

  async savePdf(orderId: number, buffer: Buffer, filename: string, mimeType: string): Promise<void> {
    const query = `
      INSERT INTO order_pdfs (order_id, filename, mime_type, pdf_data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (order_id) DO UPDATE
      SET filename = EXCLUDED.filename,
          mime_type = EXCLUDED.mime_type,
          pdf_data = EXCLUDED.pdf_data,
          updated_at = NOW()
    `;
    await this.db.query(query, [orderId, filename, mimeType, buffer]);
  }

  async getPdf(orderId: number): Promise<{ pdf_data: Buffer; filename: string; mime_type: string; updated_at?: Date } | null> {
    const query = `
      SELECT pdf_data, filename, mime_type, updated_at
      FROM order_pdfs
      WHERE order_id = $1
    `;
    const result = await this.db.query(query, [orderId]);
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  }
}
