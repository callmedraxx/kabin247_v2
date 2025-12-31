import { DatabaseAdapter } from '../database/adapter';
import { Order, OrderItem, OrderSearchParams, OrderListResponse, CreateOrderDTO, UpdateOrderDTO, getOrderTypeFromAlias, OrderType } from '../models/order';
import { OrderRepository } from './order.repository';

export class PostgreSQLOrderRepository implements OrderRepository {
  constructor(private db: DatabaseAdapter) {}

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
    // We need to find orders that match the pattern: XX25NNN where XX is any 2 letters
    const query = `
      SELECT order_number FROM orders
      WHERE order_number ~ $1
      ORDER BY CAST(SUBSTRING(order_number FROM 4) AS INTEGER) DESC
      LIMIT 1
    `;
    // Pattern: 2 letters + year (2 digits) + number (at least 2 digits)
    // e.g., matches MS25619, HB25620, etc.
    const pattern = `^[A-Z]{2}${currentYear}\\d{2,}$`;
    const result = await this.db.query(query, [pattern]);
    
    if (result.rows.length === 0) {
      // First order in this year
      return `${initials}${currentYear}01`;
    }
    
    const lastOrderNumber = result.rows[0].order_number;
    // Extract the numeric part after the year (e.g., "MS25" -> extract "619" from "MS25619")
    // The year is always 2 digits, so we start from position 4 (after 2-letter initials + 2-digit year)
    const numericPart = lastOrderNumber.substring(4);
    const lastSequence = parseInt(numericPart) || 0;
    const nextSequence = lastSequence + 1;
    
    // Format: {INITIALS}{YEAR}{NUMBER} with number padded to at least 2 digits
    // e.g., MS2501, HB2502, MS2503, ..., MS25619, HB25620
    return `${initials}${currentYear}${String(nextSequence).padStart(2, '0')}`;
  }

  /**
   * Check if an order_number already exists
   */
  async orderNumberExists(orderNumber: string, excludeOrderId?: number): Promise<boolean> {
    let query = 'SELECT id FROM orders WHERE order_number = $1';
    const params: any[] = [orderNumber];
    
    if (excludeOrderId !== undefined) {
      query += ' AND id != $2';
      params.push(excludeOrderId);
    }
    
    const result = await this.db.query(query, params);
    return result.rows.length > 0;
  }

  async create(orderData: CreateOrderDTO, orderNumber: string): Promise<Order> {
    // Calculate subtotal and total
    const subtotal = orderData.items.reduce((sum, item) => sum + item.price, 0);
    const serviceCharge = orderData.service_charge || 0;
    const deliveryFee = orderData.delivery_fee || 0;
    const total = subtotal + serviceCharge + deliveryFee;

    // Insert order
    const orderQuery = `
      INSERT INTO orders (
        order_number, client_id, caterer_id, airport_id, fbo_id, client_name, caterer, airport, aircraft_tail_number,
        delivery_date, delivery_time, order_priority, payment_method, status, order_type,
        description, notes, reheating_instructions, packaging_instructions,
        dietary_restrictions, delivery_fee, service_charge, subtotal, total,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW())
      RETURNING *
    `;
    
    const orderResult = await this.db.query(orderQuery, [
      orderNumber,
      orderData.client_id || null,
      orderData.caterer_id || null,
      orderData.airport_id || null,
      orderData.fbo_id || null,
      orderData.client_name,
      orderData.caterer,
      orderData.airport,
      orderData.aircraft_tail_number || null,
      orderData.delivery_date,
      orderData.delivery_time,
      orderData.order_priority,
      orderData.payment_method,
      'awaiting_quote',
      orderData.order_type,
      orderData.description || null,
      orderData.notes || null,
      orderData.reheating_instructions || null,
      orderData.packaging_instructions || null,
      orderData.dietary_restrictions || null,
      deliveryFee,
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
          order_id, menu_item_id, item_name, item_description, portion_size, price, category, packaging, sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      const itemResult = await this.db.query(itemQuery, [
        order.id,
        item.menu_item_id || null,
        item.item_name,
        item.item_description || null,
        item.portion_size,
        item.price,
        item.category || null,
        item.packaging || null,
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
    const orderQuery = `
      SELECT 
        o.*,
        c.full_name as client_full_name,
        c.company_name as client_company_name,
        c.full_address as client_full_address,
        c.email as client_email,
        c.contact_number as client_contact_number,
        c.additional_emails as client_additional_emails,
        cat.caterer_name,
        cat.caterer_number,
        cat.caterer_email,
        cat.time_zone as cat_time_zone,
        cat.airport_code_iata as cat_airport_code_iata,
        cat.airport_code_icao as cat_airport_code_icao,
        cat.additional_emails as caterer_additional_emails,
        a.airport_name,
        a.airport_code_iata,
        a.airport_code_icao,
        f.fbo_name,
        f.fbo_email,
        f.fbo_phone
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN caterers cat ON o.caterer_id = cat.id
      LEFT JOIN airports a ON o.airport_id = a.id
      LEFT JOIN fbos f ON o.fbo_id = f.id
      WHERE o.id = $1
    `;
    const orderResult = await this.db.query(orderQuery, [id]);
    
    if (orderResult.rows.length === 0) {
      return null;
    }

    const row = orderResult.rows[0];
    // Exclude flat fields and joined fields, keep only order table fields
    const {
      client_name,
      caterer,
      airport,
      client_full_name,
      client_company_name,
      client_full_address,
      client_email,
      client_contact_number,
      client_additional_emails,
      caterer_name,
      caterer_number,
      caterer_email,
      cat_time_zone,
      cat_airport_code_iata,
      cat_airport_code_icao,
      caterer_additional_emails,
      airport_name,
      airport_code_iata,
      airport_code_icao,
      fbo_name,
      fbo_email,
      fbo_phone,
      ...orderFields
    } = row;
    
    const order: Order = {
      ...orderFields,
      revision_count: row.revision_count || 0,
      client: row.client_id ? {
        id: row.client_id,
        full_name: row.client_full_name || '',
        company_name: row.client_company_name || undefined,
        full_address: row.client_full_address || '',
        email: row.client_email || undefined,
        contact_number: row.client_contact_number || undefined,
        additional_emails: row.client_additional_emails || [],
      } : undefined,
      caterer_details: row.caterer_id ? {
        id: row.caterer_id,
        caterer_name: row.caterer_name,
        caterer_number: row.caterer_number,
        caterer_email: row.caterer_email,
        time_zone: row.cat_time_zone,
        airport_code_iata: row.cat_airport_code_iata,
        airport_code_icao: row.cat_airport_code_icao,
        additional_emails: row.caterer_additional_emails || [],
      } : undefined,
      airport_details: row.airport_id ? {
        id: row.airport_id,
        airport_name: row.airport_name,
        airport_code_iata: row.airport_code_iata,
        airport_code_icao: row.airport_code_icao,
      } : undefined,
      fbo: row.fbo_name ? {
        id: row.fbo_id,
        fbo_name: row.fbo_name,
        fbo_email: row.fbo_email,
        fbo_phone: row.fbo_phone,
      } : undefined,
    };

    // Get order items with menu details
    const itemsQuery = `
      SELECT oi.*, mi.item_name as menu_item_name, mi.item_description as menu_item_description
      FROM order_items oi
      LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id = $1
      ORDER BY oi.sort_order ASC, oi.id ASC
    `;
    const itemsResult = await this.db.query(itemsQuery, [id]);
    order.items = itemsResult.rows.map((item: any) => {
      const { menu_item_name, menu_item_description, ...itemFields } = item;
      return {
        ...itemFields,
        item_name: item.menu_item_name || item.item_name,
        item_description: item.item_description || item.menu_item_description || undefined,
        category: item.category || undefined,
        packaging: item.packaging || undefined,
      };
    });

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
        o.order_number ILIKE $${paramIndex} OR
        o.client_name ILIKE $${paramIndex} OR
        o.caterer ILIKE $${paramIndex} OR
        o.airport ILIKE $${paramIndex} OR
        o.aircraft_tail_number ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${params.search}%`);
      paramIndex++;
    }

    // Apply status filter
    if (params.status && params.status !== 'all') {
      whereConditions.push(`o.status = $${paramIndex}`);
      queryParams.push(params.status);
      paramIndex++;
    }

    // Apply date range filter
    if (params.start_date) {
      whereConditions.push(`o.delivery_date >= $${paramIndex}`);
      queryParams.push(params.start_date);
      paramIndex++;
    }
    if (params.end_date) {
      whereConditions.push(`o.delivery_date <= $${paramIndex}`);
      queryParams.push(params.end_date);
      paramIndex++;
    }

    // Apply client_name filter
    if (params.client_name) {
      whereConditions.push(`o.client_name ILIKE $${paramIndex}`);
      queryParams.push(`%${params.client_name}%`);
      paramIndex++;
    }

    // Apply caterer filter
    if (params.caterer) {
      whereConditions.push(`o.caterer ILIKE $${paramIndex}`);
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
    const orderBy = `ORDER BY o.${sortBy} ${sortOrder}`;

    // Count query (use alias 'o' to match whereConditions)
    const countQuery = `SELECT COUNT(*) as total FROM orders o ${whereClause}`;
    const countResult = await this.db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    // Data query with JOINs to get related details
    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    const dataParams = [...queryParams, limit, offset];
    const dataQuery = `
      SELECT 
        o.*,
        c.full_name as client_full_name,
        c.company_name as client_company_name,
        c.full_address as client_full_address,
        c.email as client_email,
        c.contact_number as client_contact_number,
        c.additional_emails as client_additional_emails,
        cat.caterer_name,
        cat.caterer_number,
        cat.caterer_email,
        cat.time_zone as cat_time_zone,
        cat.airport_code_iata as cat_airport_code_iata,
        cat.airport_code_icao as cat_airport_code_icao,
        cat.additional_emails as caterer_additional_emails,
        a.airport_name,
        a.airport_code_iata,
        a.airport_code_icao,
        f.fbo_name,
        f.fbo_email,
        f.fbo_phone
      FROM orders o
      LEFT JOIN clients c ON o.client_id = c.id
      LEFT JOIN caterers cat ON o.caterer_id = cat.id
      LEFT JOIN airports a ON o.airport_id = a.id
      LEFT JOIN fbos f ON o.fbo_id = f.id
      ${whereClause}
      ${orderBy}
      LIMIT $${limitParam} OFFSET $${offsetParam}
    `;
    const result = await this.db.query(dataQuery, dataParams);

    // Map orders to include nested objects, excluding flat fields
    const orders = result.rows.map((row: any) => {
      // Exclude flat fields and joined fields, keep only order table fields
      const {
        client_name,
        caterer,
        airport,
        client_full_name,
        client_company_name,
        client_full_address,
        client_email,
        client_contact_number,
        client_additional_emails,
        caterer_name,
        caterer_number,
        caterer_email,
        cat_time_zone,
        cat_airport_code_iata,
        cat_airport_code_icao,
        caterer_additional_emails,
        airport_name,
        fbo_name,
        fbo_email,
        fbo_phone,
        airport_code_iata,
        airport_code_icao,
        ...orderFields
      } = row;
      
      const order: Order = {
        ...orderFields,
        revision_count: row.revision_count || 0,
        client: row.client_id ? {
          id: row.client_id,
          full_name: row.client_full_name || '',
          company_name: row.client_company_name || undefined,
          full_address: row.client_full_address || '',
          email: row.client_email || undefined,
          contact_number: row.client_contact_number || undefined,
          additional_emails: row.client_additional_emails || [],
        } : undefined,
        caterer_details: row.caterer_id ? {
          id: row.caterer_id,
          caterer_name: row.caterer_name,
          caterer_number: row.caterer_number,
          caterer_email: row.caterer_email,
          time_zone: row.cat_time_zone,
          airport_code_iata: row.cat_airport_code_iata,
          airport_code_icao: row.cat_airport_code_icao,
          additional_emails: row.caterer_additional_emails || [],
        } : undefined,
        airport_details: row.airport_id ? {
          id: row.airport_id,
          airport_name: row.airport_name,
          airport_code_iata: row.airport_code_iata,
          airport_code_icao: row.airport_code_icao,
        } : undefined,
        fbo: row.fbo_name ? {
          id: row.fbo_id,
          fbo_name: row.fbo_name,
          fbo_email: row.fbo_email,
          fbo_phone: row.fbo_phone,
        } : undefined,
        items: [], // Will be populated below
      };
      return order;
    });

    // Fetch order items for all orders in one query
    if (orders.length > 0) {
      const orderIds = orders.map((o: Order) => o.id);
      const itemsQuery = `
        SELECT oi.*, mi.item_name as menu_item_name, mi.item_description as menu_item_description
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = ANY($1::int[])
        ORDER BY oi.order_id, oi.sort_order ASC, oi.id ASC
      `;
      const itemsResult = await this.db.query(itemsQuery, [orderIds]);
      
      // Group items by order_id
      const itemsByOrderId = new Map<number, OrderItem[]>();
      itemsResult.rows.forEach((item: any) => {
        if (!itemsByOrderId.has(item.order_id)) {
          itemsByOrderId.set(item.order_id, []);
        }
        const { menu_item_name, menu_item_description, ...itemFields } = item;
        itemsByOrderId.get(item.order_id)!.push({
          ...itemFields,
          item_name: item.menu_item_name || item.item_name,
          item_description: item.item_description || item.menu_item_description || undefined,
          category: item.category || undefined,
          packaging: item.packaging || undefined,
        });
      });

      // Assign items to orders
      orders.forEach((order: Order) => {
        if (order.id) {
          order.items = itemsByOrderId.get(order.id) || [];
        }
      });
    }

    return {
      orders,
      total,
      page,
      limit,
    };
  }

  async update(id: number, orderData: UpdateOrderDTO): Promise<Order | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Build update fields - Reference IDs
    if (orderData.client_id !== undefined) {
      updates.push(`client_id = $${paramIndex++}`);
      values.push(orderData.client_id || null);
    }
    if (orderData.caterer_id !== undefined) {
      updates.push(`caterer_id = $${paramIndex++}`);
      values.push(orderData.caterer_id || null);
    }
    if (orderData.airport_id !== undefined) {
      updates.push(`airport_id = $${paramIndex++}`);
      values.push(orderData.airport_id || null);
    }
    if (orderData.fbo_id !== undefined) {
      updates.push(`fbo_id = $${paramIndex++}`);
      values.push(orderData.fbo_id || null);
    }
    
    // Display name fields
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
    if (orderData.delivery_fee !== undefined) {
      updates.push(`delivery_fee = $${paramIndex++}`);
      values.push(orderData.delivery_fee);
    }
    if (orderData.order_type !== undefined) {
      const orderType = getOrderTypeFromAlias(orderData.order_type as string) || (orderData.order_type as OrderType);
      updates.push(`order_type = $${paramIndex++}`);
      values.push(orderType);
    }
    if (orderData.order_number !== undefined) {
      updates.push(`order_number = $${paramIndex++}`);
      values.push(orderData.order_number);
    }

    // Handle items update - support unlimited items
    if (orderData.items && orderData.items.length > 0) {
      // Delete existing items
      await this.db.query('DELETE FROM order_items WHERE order_id = $1', [id]);
      
      // Insert new items with category and packaging
      for (let i = 0; i < orderData.items.length; i++) {
        const item = orderData.items[i];
        await this.db.query(
          `INSERT INTO order_items (order_id, menu_item_id, item_name, item_description, portion_size, price, category, packaging, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id,
            item.menu_item_id || null,
            item.item_name,
            item.item_description || null,
            item.portion_size,
            item.price,
            item.category || null,
            item.packaging || null,
            i,
          ]
        );
      }
    }

    // Recalculate subtotal and total if items, service_charge, or delivery_fee changed
    if (orderData.items || orderData.service_charge !== undefined || orderData.delivery_fee !== undefined) {
      const itemsQuery = 'SELECT SUM(price) as subtotal FROM order_items WHERE order_id = $1';
      const itemsResult = await this.db.query(itemsQuery, [id]);
      const subtotal = parseFloat(itemsResult.rows[0].subtotal || '0');
      
      const orderResult = await this.db.query('SELECT service_charge, delivery_fee FROM orders WHERE id = $1', [id]);
      const serviceCharge = orderData.service_charge !== undefined 
        ? orderData.service_charge 
        : parseFloat(orderResult.rows[0].service_charge || '0');
      const deliveryFee = orderData.delivery_fee !== undefined 
        ? orderData.delivery_fee 
        : parseFloat(orderResult.rows[0].delivery_fee || '0');
      
      updates.push(`subtotal = $${paramIndex++}`);
      values.push(subtotal);
      updates.push(`total = $${paramIndex++}`);
      values.push(subtotal + serviceCharge + deliveryFee);
    }

    if (updates.length === 0 && !orderData.items) {
      return this.findById(id);
    }

    // Clear cached PDF since order data has changed
    await this.db.query('DELETE FROM order_pdfs WHERE order_id = $1', [id]);

    // Increment revision_count on any update
    updates.push(`revision_count = revision_count + 1`);
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
    // Set completed_at for terminal statuses
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
