import { Router, Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { CreateOrderDTO, UpdateOrderDTO, OrderSearchParams, OrderStatusUpdateDTO, OrderEmailDTO, CreateOrderFromRefsDTO } from '../models/order';
import { Logger } from '../utils/logger';
import { generateOrderHTML, generateOrderHTMLB } from '../utils/order-pdf';
import { getEmailService, EmailRecipient } from '../services/email.service';
import { requireAuth, requirePermission, requireRole } from '../middleware/auth';

export const orderRouter = Router();
const orderService = new OrderService();

// All order routes require authentication
orderRouter.use(requireAuth);

/**
 * @swagger
 * components:
 *   schemas:
 *     Order:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         order_number:
 *           type: string
 *         client_name:
 *           type: string
 *         caterer:
 *           type: string
 *         airport:
 *           type: string
 *         aircraft_tail_number:
 *           type: string
 *         delivery_date:
 *           type: string
 *           format: date
 *         delivery_time:
 *           type: string
 *         order_priority:
 *           type: string
 *           enum: [low, normal, high, urgent]
 *         payment_method:
 *           type: string
 *           enum: [card, ACH]
 *         status:
 *           type: string
 *           enum: [awaiting_quote, awaiting_client_approval, awaiting_caterer, caterer_confirmed, in_preparation, ready_for_delivery, delivered, paid, cancelled, order_changed]
 *         description:
 *           type: string
 *         notes:
 *           type: string
 *         reheating_instructions:
 *           type: string
 *         packaging_instructions:
 *           type: string
 *         dietary_restrictions:
 *           type: string
 *         order_type:
 *           type: string
 *           enum: [Inflight order, QE Serv Hub Order, Restaurant Pickup Order]
 *           description: Order type display name
 *         delivery_fee:
 *           type: number
 *         service_charge:
 *           type: number
 *         coordination_fee:
 *           type: number
 *         airport_fee:
 *           type: number
 *         fbo_fee:
 *           type: number
 *         shopping_fee:
 *           type: number
 *         restaurant_pickup_fee:
 *           type: number
 *         airport_pickup_fee:
 *           type: number
 *         subtotal:
 *           type: number
 *         total:
 *           type: number
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OrderItem'
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         completed_at:
 *           type: string
 *           format: date-time
 *     OrderItem:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         item_name:
 *           type: string
 *         item_description:
 *           type: string
 *         portion_size:
 *           type: string
 *         price:
 *           type: number
 *         category:
 *           type: string
 *           description: Item category (e.g., Appetizers, Main Course)
 *         packaging:
 *           type: string
 *           description: Item packaging (e.g., Foil container, Insulated box)
 *         sort_order:
 *           type: integer
 *     CreateOrder:
 *       type: object
 *       required:
 *         - client_name
 *         - caterer
 *         - airport
 *         - delivery_date
 *         - delivery_time
 *         - order_priority
 *         - payment_method
 *         - order_type
 *         - items
 *       properties:
 *         order_number:
 *           type: string
 *           description: Optional order number. If provided, will be used; otherwise auto-generated (e.g., KA000001)
 *           example: "CUSTOM-001"
 *         client_name:
 *           type: string
 *         caterer:
 *           type: string
 *         airport:
 *           type: string
 *         aircraft_tail_number:
 *           type: string
 *         delivery_date:
 *           type: string
 *           format: date
 *         delivery_time:
 *           type: string
 *         order_priority:
 *           type: string
 *           enum: [low, normal, high, urgent]
 *         payment_method:
 *           type: string
 *           enum: [card, ACH]
 *         order_type:
 *           type: string
 *           enum: [Inflight order, QE Serv Hub Order, Restaurant Pickup Order, inflight, qe_serv_hub, restaurant_pickup]
 *           description: Order type - can use full name or alias (inflight, qe_serv_hub, restaurant_pickup)
 *         description:
 *           type: string
 *         notes:
 *           type: string
 *         reheating_instructions:
 *           type: string
 *         packaging_instructions:
 *           type: string
 *         dietary_restrictions:
 *           type: string
 *         delivery_fee:
 *           type: number
 *           description: Delivery fee for the order
 *         service_charge:
 *           type: number
 *         coordination_fee:
 *           type: number
 *           description: Optional coordination fee for the order
 *         airport_fee:
 *           type: number
 *           description: Optional airport fee for the order
 *         fbo_fee:
 *           type: number
 *           description: Optional FBO fee for the order
 *         shopping_fee:
 *           type: number
 *           description: Optional shopping fee for the order
 *         restaurant_pickup_fee:
 *           type: number
 *           description: Optional restaurant pickup fee for the order
 *         airport_pickup_fee:
 *           type: number
 *           description: Optional airport pickup fee for the order
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - item_name
 *               - portion_size
 *               - price
 *             properties:
 *               item_name:
 *                 type: string
 *               item_description:
 *                 type: string
 *               portion_size:
 *                 type: string
 *               price:
 *                 type: number
 *               category:
 *                 type: string
 *                 description: Item category (e.g., Appetizers, Main Course)
 *               packaging:
 *                 type: string
 *                 description: Item packaging instructions
 *     CreateOrderFromRefs:
 *       type: object
 *       required:
 *         - client_id
 *         - caterer_id
 *         - airport_id
 *         - delivery_date
 *         - delivery_time
 *         - order_priority
 *         - payment_method
 *         - order_type
 *         - items
 *       properties:
 *         order_number:
 *           type: string
 *           description: Optional order number. If provided, will be used; otherwise auto-generated (e.g., KA000001)
 *           example: "CUSTOM-001"
 *         client_id:
 *           type: integer
 *         caterer_id:
 *           type: integer
 *         airport_id:
 *           type: integer
 *         fbo_id:
 *           type: integer
 *           description: Optional FBO ID to auto-fill FBO details
 *           example: 1
 *         aircraft_tail_number:
 *           type: string
 *         delivery_date:
 *           type: string
 *           format: date
 *         delivery_time:
 *           type: string
 *         order_priority:
 *           type: string
 *           enum: [low, normal, high, urgent]
 *         payment_method:
 *           type: string
 *           enum: [card, ACH]
 *         order_type:
 *           type: string
 *           enum: [Inflight order, QE Serv Hub Order, Restaurant Pickup Order, inflight, qe_serv_hub, restaurant_pickup]
 *           description: Order type - can use full name or alias (inflight, qe_serv_hub, restaurant_pickup)
 *         description:
 *           type: string
 *         notes:
 *           type: string
 *         reheating_instructions:
 *           type: string
 *         packaging_instructions:
 *           type: string
 *         dietary_restrictions:
 *           type: string
 *         delivery_fee:
 *           type: number
 *           description: Delivery fee for the order
 *         service_charge:
 *           type: number
 *         coordination_fee:
 *           type: number
 *           description: Optional coordination fee for the order
 *         airport_fee:
 *           type: number
 *           description: Optional airport fee for the order
 *         fbo_fee:
 *           type: number
 *           description: Optional FBO fee for the order
 *         shopping_fee:
 *           type: number
 *           description: Optional shopping fee for the order
 *         restaurant_pickup_fee:
 *           type: number
 *           description: Optional restaurant pickup fee for the order
 *         airport_pickup_fee:
 *           type: number
 *           description: Optional airport pickup fee for the order
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - item_id
 *               - portion_size
 *               - price
 *             properties:
 *               item_id:
 *                 type: integer
 *               item_description:
 *                 type: string
 *               portion_size:
 *                 type: string
 *               price:
 *                 type: number
 *               category:
 *                 type: string
 *                 description: Item category (e.g., Appetizers, Main Course)
 *               packaging:
 *                 type: string
 *                 description: Item packaging (e.g., Foil container, Insulated box)
 */

/**
 * @swagger
 * /orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/CreateOrder'
 *               - $ref: '#/components/schemas/CreateOrderFromRefs'
 *           examples:
 *             basicOrder:
 *               summary: Basic order with alias order type
 *               value:
 *                 client_name: "John Doe"
 *                 caterer: "ABC Catering"
 *                 airport: "Tampa International (TPA)"
 *                 delivery_date: "2024-12-25"
 *                 delivery_time: "14:30"
 *                 order_priority: "normal"
 *                 payment_method: "card"
 *                 order_type: "inflight"
 *                 items:
 *                   - item_name: "Chicken Sandwich"
 *                     portion_size: "1"
 *                     price: 15.99
 *                   - item_name: "Salad"
 *                     portion_size: "1"
 *                     price: 12.99
 *                 delivery_fee: 5.00
 *                 service_charge: 3.00
 *             orderWithFBO:
 *               summary: Order with FBO reference
 *               value:
 *                 client_id: 1
 *                 caterer_id: 1
 *                 airport_id: 1
 *                 fbo_id: 1
 *                 aircraft_tail_number: "N12345"
 *                 delivery_date: "2024-12-25"
 *                 delivery_time: "14:30"
 *                 order_priority: "high"
 *                 payment_method: "ACH"
 *                 order_type: "qe_serv_hub"
 *                 items:
 *                   - item_id: 1
 *                     portion_size: "2"
 *                     price: 25.99
 *                 notes: "Please deliver to gate A5"
 *             restaurantPickup:
 *               summary: Restaurant pickup order
 *               value:
 *                 client_name: "Jane Smith"
 *                 caterer: "XYZ Restaurant"
 *                 airport: "Miami International (MIA)"
 *                 delivery_date: "2024-12-26"
 *                 delivery_time: "18:00"
 *                 order_priority: "normal"
 *                 payment_method: "card"
 *                 order_type: "restaurant_pickup"
 *                 items:
 *                   - item_name: "Pizza"
 *                     portion_size: "1"
 *                     price: 18.99
 *                     item_description: "Large pepperoni pizza"
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error
 */
orderRouter.post('/', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateOrderDTO | CreateOrderFromRefsDTO;
    const isReferencePayload = 'client_id' in body && 'caterer_id' in body && 'airport_id' in body;
    const order = isReferencePayload
      ? await orderService.createOrderFromReferences(body as CreateOrderFromRefsDTO)
      : await orderService.createOrder(body as CreateOrderDTO);
    res.status(201).json(order);
  } catch (error: any) {
    Logger.error('Failed to create order', error, {
      method: 'POST',
      url: '/orders',
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: List orders with pagination, search, filter, and sorting
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of orders
 *       500:
 *         description: Server error
 */
orderRouter.get('/', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const params: OrderSearchParams = {
      search: req.query.search as string,
      status: req.query.status as string,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await orderService.listOrders(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list orders', error, {
      method: 'GET',
      url: '/orders',
      query: req.query,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order found
 *       404:
 *         description: Order not found
 */
orderRouter.get('/:id', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const order = await orderService.getOrderById(id);
    if (!order) {
      Logger.warn('Order not found', {
        method: 'GET',
        url: `/orders/${id}`,
        orderId: id,
      });
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error: any) {
    Logger.error('Failed to get order by ID', error, {
      method: 'GET',
      url: `/orders/${req.params.id}`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   put:
 *     summary: Update an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               order_number:
 *                 type: string
 *                 description: Update the order number. Must be unique.
 *                 example: "CUSTOM-002"
 *               client_id:
 *                 type: integer
 *               caterer_id:
 *                 type: integer
 *               airport_id:
 *                 type: integer
 *               client_name:
 *                 type: string
 *               caterer:
 *                 type: string
 *               airport:
 *                 type: string
 *               fbo_id:
 *                 type: integer
 *                 nullable: true
 *               aircraft_tail_number:
 *                 type: string
 *               delivery_date:
 *                 type: string
 *                 format: date
 *               delivery_time:
 *                 type: string
 *               order_priority:
 *                 type: string
 *                 enum: [low, normal, high, urgent]
 *               payment_method:
 *                 type: string
 *                 enum: [card, ACH]
 *               status:
 *                 type: string
 *                 enum: [awaiting_quote, awaiting_client_approval, awaiting_caterer, caterer_confirmed, in_preparation, ready_for_delivery, delivered, paid, cancelled, order_changed]
 *               order_type:
 *                 type: string
 *               description:
 *                 type: string
 *               notes:
 *                 type: string
 *               reheating_instructions:
 *                 type: string
 *               packaging_instructions:
 *                 type: string
 *               dietary_restrictions:
 *                 type: string
 *               delivery_fee:
 *                 type: number
 *               service_charge:
 *                 type: number
 *               coordination_fee:
 *                 type: number
 *               airport_fee:
 *                 type: number
 *               fbo_fee:
 *                 type: number
 *               shopping_fee:
 *                 type: number
 *               restaurant_pickup_fee:
 *                 type: number
 *               airport_pickup_fee:
 *                 type: number
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     menu_item_id:
 *                       type: integer
 *                     item_name:
 *                       type: string
 *                     item_description:
 *                       type: string
 *                     portion_size:
 *                       type: string
 *                     price:
 *                       type: number
 *                     category:
 *                       type: string
 *                     packaging:
 *                       type: string
 *     responses:
 *       200:
 *         description: Order updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Order not found
 */
orderRouter.put('/:id', requirePermission('orders.update_status'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const orderData: UpdateOrderDTO = req.body;
    const order = await orderService.updateOrder(id, orderData);
    if (!order) {
      Logger.warn('Order not found for update', {
        method: 'PUT',
        url: `/orders/${id}`,
        orderId: id,
      });
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error: any) {
    Logger.error('Failed to update order', error, {
      method: 'PUT',
      url: `/orders/${req.params.id}`,
      orderId: req.params.id,
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/status:
 *   patch:
 *     summary: Update order status
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid status value
 *       404:
 *         description: Order not found
 */
orderRouter.patch('/:id/status', requirePermission('orders.update_status'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const statusData: OrderStatusUpdateDTO = req.body;
    
    // Prevent manual status update to 'paid' - this can only be set automatically via payment processing
    if (statusData.status === 'paid') {
      return res.status(403).json({ 
        error: 'Order status cannot be manually set to "paid". Payment must be processed through the payment system.' 
      });
    }
    
    const order = await orderService.updateOrderStatus(id, statusData);
    if (!order) {
      Logger.warn('Order not found for status update', {
        method: 'PATCH',
        url: `/orders/${id}/status`,
        orderId: id,
      });
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({
      id: order.id,
      order_number: order.order_number,
      status: order.status,
      updated_at: order.updated_at,
    });
  } catch (error: any) {
    Logger.error('Failed to update order status', error, {
      method: 'PATCH',
      url: `/orders/${req.params.id}/status`,
      orderId: req.params.id,
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}:
 *   delete:
 *     summary: Delete an order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order deleted successfully
 *       404:
 *         description: Order not found
 */
orderRouter.delete('/:id', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await orderService.deleteOrder(id);
    if (!deleted) {
      Logger.warn('Order not found for deletion', {
        method: 'DELETE',
        url: `/orders/${id}`,
        orderId: id,
      });
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json({ message: 'Order deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete order', error, {
      method: 'DELETE',
      url: `/orders/${req.params.id}`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders:
 *   delete:
 *     summary: Bulk delete orders
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Orders deleted successfully
 *       400:
 *         description: Invalid request
 */
orderRouter.delete('/', requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await orderService.deleteOrders(ids);
    res.json({ message: 'Orders deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to delete orders', error, {
      method: 'DELETE',
      url: '/orders',
      body: req.body,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/preview:
 *   get:
 *     summary: Get HTML preview of order
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: HTML preview
 *       404:
 *         description: Order not found
 */
orderRouter.get('/:id/preview', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Build absolute logo URL for frontend to fetch (use forwarded headers from proxy)
    const protocol = req.get('X-Forwarded-Proto') || req.protocol;
    const host = req.get('X-Forwarded-Host') || req.get('host');
    const logoUrl = `${protocol}://${host}/assets/logo.png`;
    
    // Pass logo URL to HTML generator
    const orderWithLogo = { ...order, _logoUrl: logoUrl };
    
    // Route to PDF A or PDF B based on order status
    // PDF A (with pricing): awaiting_client_approval, paid, delivered
    // PDF B (no pricing): awaiting_quote, awaiting_caterer, caterer_confirmed, in_preparation, ready_for_delivery, cancelled, order_changed
    // Special handling:
    //   - caterer_confirmed: PDF B with client info and status "caterer confirmed" (not revision)
    //   - delivered: PDF A with pricing and client info
    let html: string;
    const pdfAStatuses = ['awaiting_client_approval', 'paid', 'delivered'];
    const usePdfA = pdfAStatuses.includes(order.status);
    
    // Log for debugging
    Logger.info('PDF Preview routing', {
      orderId: id,
      orderNumber: order.order_number,
      status: order.status,
      usePdfA,
      clientId: order.client_id,
      hasClient: !!order.client,
    });
    
    if (order.status === 'caterer_confirmed') {
      // PDF B with client info and status (not revision)
      html = generateOrderHTMLB(orderWithLogo, 'client');
    } else if (usePdfA) {
      // PDF A with pricing
      html = generateOrderHTML(orderWithLogo);
    } else {
      // PDF B (default for other statuses)
      html = generateOrderHTMLB(orderWithLogo);
    }
    
    res.json({ html, order_number: order.order_number, order, logoUrl });
  } catch (error: any) {
    Logger.error('Failed to generate order preview', error, {
      method: 'GET',
      url: `/orders/${req.params.id}/preview`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/pdf:
 *   get:
 *     summary: Download order as PDF
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: download
 *         schema:
 *           type: boolean
 *         description: "Force download (default: true)"
 *     responses:
 *       200:
 *         description: PDF file
 *       404:
 *         description: Order not found
 */
orderRouter.get('/:id/pdf', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const regenerate = req.query.regenerate === 'true';
    const order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Route to PDF A or PDF B based on order status
    // PDF A (with pricing): awaiting_client_approval, paid, delivered
    // PDF B (no pricing): awaiting_quote, awaiting_caterer, caterer_confirmed, in_preparation, ready_for_delivery, cancelled, order_changed
    // Special handling:
    //   - caterer_confirmed: PDF B with client info and status "caterer confirmed" (not revision)
    //   - delivered: PDF A with pricing and client info
    let pdf: { buffer: Buffer; filename: string; mimeType: string; order: any };
    const pdfAStatuses = ['awaiting_client_approval', 'paid', 'delivered'];
    const usePdfA = pdfAStatuses.includes(order.status);
    
    // Log for debugging
    Logger.info('PDF Download routing', {
      orderId: id,
      orderNumber: order.order_number,
      status: order.status,
      usePdfA,
      regenerate,
      clientId: order.client_id,
      hasClient: !!order.client,
    });
    
    if (order.status === 'caterer_confirmed') {
      // PDF B with client info and status (not revision)
      pdf = await orderService.getOrCreateOrderPdfB(id, 'client');
    } else if (usePdfA) {
      // PDF A with pricing
      pdf = await orderService.getOrCreateOrderPdf(id, regenerate);
    } else {
      // PDF B (default for other statuses)
      pdf = await orderService.getOrCreateOrderPdfB(id);
    }
    
    const download = req.query.download !== 'false';
    const filename = pdf.filename;

    res.setHeader('Content-Type', pdf.mimeType);
    res.setHeader(
      'Content-Disposition',
      download ? `attachment; filename=${filename}` : `inline; filename=${filename}`
    );

    res.end(pdf.buffer);
  } catch (error: any) {
    Logger.error('Failed to generate order PDF', error, {
      method: 'GET',
      url: `/orders/${req.params.id}/pdf`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/preview-b:
 *   get:
 *     summary: Get HTML preview of order (PDF B format - Vendor PO / No Pricing)
 *     description: Returns HTML preview for PDF B format - items grouped by category, no pricing information
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: HTML preview (PDF B format)
 *       404:
 *         description: Order not found
 */
orderRouter.get('/:id/preview-b', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Build absolute logo URL for frontend to fetch
    const protocol = req.get('X-Forwarded-Proto') || req.protocol;
    const host = req.get('X-Forwarded-Host') || req.get('host');
    const logoUrl = `${protocol}://${host}/assets/logo.png`;
    
    // Pass logo URL to HTML generator
    // For caterer_confirmed status, use 'client' recipient type to show client info and status
    const recipientType = order.status === 'caterer_confirmed' ? 'client' : 'caterer';
    const orderWithLogo = { ...order, _logoUrl: logoUrl };
    const html = generateOrderHTMLB(orderWithLogo, recipientType);
    res.json({ html, order_number: order.order_number, order, logoUrl });
  } catch (error: any) {
    Logger.error('Failed to generate order preview B', error, {
      method: 'GET',
      url: `/orders/${req.params.id}/preview-b`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/pdf-b:
 *   get:
 *     summary: Download order as PDF B (Vendor PO / No Pricing)
 *     description: Returns PDF B format - items grouped by category, no pricing information. Used for vendor purchase orders.
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: download
 *         schema:
 *           type: boolean
 *         description: "Force download (default: true)"
 *     responses:
 *       200:
 *         description: PDF file (B format)
 *       404:
 *         description: Order not found
 */
orderRouter.get('/:id/pdf-b', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // For caterer_confirmed status, use 'client' recipient type to show client info and status
    const recipientType = order.status === 'caterer_confirmed' ? 'client' : 'caterer';
    const pdf = await orderService.getOrCreateOrderPdfB(id, recipientType);
    
    const download = req.query.download !== 'false';
    const filename = pdf.filename;

    res.setHeader('Content-Type', pdf.mimeType);
    res.setHeader(
      'Content-Disposition',
      download ? `attachment; filename=${filename}` : `inline; filename=${filename}`
    );

    res.end(pdf.buffer);
  } catch (error: any) {
    Logger.error('Failed to generate order PDF B', error, {
      method: 'GET',
      url: `/orders/${req.params.id}/pdf-b`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/send-to-client:
 *   post:
 *     summary: Send order email to client
 *     description: Sends an email to the client with the order PDF attached. Email template is based on order status.
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               custom_message:
 *                 type: string
 *                 description: Optional custom message to override the default template
 *               custom_subject:
 *                 type: string
 *                 description: Optional custom subject to override the default subject
 *               purpose:
 *                 type: string
 *                 enum: [quote, confirmation, delivery, invoice, update, cancellation]
 *                 description: Override the email purpose (affects subject and PDF format)
 *               pdf_format:
 *                 type: string
 *                 enum: [A, B]
 *                 description: Override PDF format (A=with pricing, B=without pricing)
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       400:
 *         description: Email not configured or client email not found
 *       404:
 *         description: Order not found
 */
orderRouter.post('/:id/send-to-client', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    let order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const emailService = getEmailService();
    if (!emailService.isConfigured()) {
      return res.status(400).json({ error: 'Email service is not configured' });
    }

    // Get client email from order's nested client object
    const clientEmail = order.client?.email;
    if (!clientEmail) {
      return res.status(400).json({ error: 'No email address found for client' });
    }

    // Get client first name for personalization
    const clientFirstName = order.client?.full_name?.split(' ')[0] || 'Valued Customer';

    // Get template based on order status (includes purpose and pdfFormat)
    const template = emailService.getTemplate('client', order.status || 'default');
    
    // Allow override of purpose via request body (e.g., to send invoice)
    const purpose = req.body.purpose || template.purpose;
    const pdfFormat = req.body.pdf_format || template.pdfFormat;
    
    // Only ADMIN can send final invoice (when status is paid or purpose is invoice)
    const isInvoice = order.status === 'paid' || purpose === 'invoice';
    if (isInvoice && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only administrators can send final invoice emails' });
    }
    
    // Get airport code for subject line
    const airportCode = order.airport_details?.airport_code_iata || 
      order.airport_details?.airport_code_icao || 
      (order.airport && order.airport.length <= 10 ? order.airport : '') || 
      '';
    
    // Get subject using the new format (pass status, delivery date, and delivery time for special handling)
    const subject = req.body.custom_subject || emailService.getSubject(
      order.order_number || '', 
      'client', 
      purpose, 
      airportCode, 
      order.status,
      order.delivery_date,
      order.delivery_time
    );
    const body = req.body.custom_message || template.body(clientFirstName);

    // Generate HTML email
    const html = emailService.generateEmailHTML(body, order.order_number || '');

      // Get PDF attachment based on format (A = with pricing, B = without pricing)
    // For delivered status, ALWAYS use PDF B (no pricing) with client info in Bill To section
      // For clients, always pass 'client' as recipient type to show status instead of revision
    const attachments = [];
    // Delivered orders always get PDF B with client info (no pricing)
    const usePdfB = order.status === 'delivered' || pdfFormat === 'B';
    const pdfResult = usePdfB
        ? await orderService.getOrCreateOrderPdfB(id, 'client')
        : await orderService.getOrCreateOrderPdf(id);
      
      attachments.push({
        filename: pdfResult.filename,
        content: pdfResult.buffer,
        contentType: 'application/pdf',
      });

    // Get CC emails from request body
    const ccEmails = req.body.cc_emails && Array.isArray(req.body.cc_emails) 
      ? req.body.cc_emails.filter((e: string) => e && e.trim())
      : undefined;

    // Send email
    const result = await emailService.sendEmail({
      to: clientEmail,
      cc: ccEmails,
      subject,
      html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    Logger.info('Email sent to client', {
      orderId: id,
      orderNumber: order.order_number,
      recipient: clientEmail,
      status: order.status,
      pdfFormat,
      purpose,
    });

    res.json({
      message: 'Email sent to client successfully',
      recipient: clientEmail,
      order_number: order.order_number,
      status: order.status,
      pdf_format: pdfFormat,
      purpose,
      sent_at: new Date().toISOString(),
      messageId: result.messageId,
    });
  } catch (error: any) {
    Logger.error('Failed to send email to client', error, {
      method: 'POST',
      url: `/orders/${req.params.id}/send-to-client`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/send-to-caterer:
 *   post:
 *     summary: Send order email to caterer/vendor
 *     description: Sends an email to the caterer with the order PDF attached. Email template is based on order status.
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               custom_message:
 *                 type: string
 *                 description: Optional custom message to override the default template
 *               custom_subject:
 *                 type: string
 *                 description: Optional custom subject to override the default subject
 *               purpose:
 *                 type: string
 *                 enum: [quote_request, order_request, update, cancellation]
 *                 description: Override the email purpose (affects subject). Caterer always receives PDF B (no pricing)
 *               update_status:
 *                 type: string
 *                 enum: [awaiting_quote, awaiting_client_approval, awaiting_caterer, caterer_confirmed, in_preparation, ready_for_delivery, delivered, paid, cancelled, order_changed]
 *                 description: Optional new status to set after sending email
 *     responses:
 *       200:
 *         description: Email sent successfully
 *       400:
 *         description: Email not configured or caterer email not found
 *       404:
 *         description: Order not found
 */
orderRouter.post('/:id/send-to-caterer', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    let order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const emailService = getEmailService();
    if (!emailService.isConfigured()) {
      return res.status(400).json({ error: 'Email service is not configured' });
    }

    // Get caterer email from order's nested caterer_details object
    const catererEmail = order.caterer_details?.caterer_email;
    if (!catererEmail) {
      return res.status(400).json({ error: 'No email address found for caterer' });
    }

    // Get template based on order status (includes purpose and pdfFormat)
    const template = emailService.getTemplate('caterer', order.status || 'default');
    
    // Caterer always gets PDF B (no pricing)
    const purpose = req.body.purpose || template.purpose;
    const pdfFormat = 'B'; // Always PDF B for caterer
    
    // Get airport code for subject line
    const airportCode = order.airport_details?.airport_code_iata || 
      order.airport_details?.airport_code_icao || 
      (order.airport && order.airport.length <= 10 ? order.airport : '') || 
      '';
    
    // Get subject using the new format (pass status, delivery date, and delivery time for special handling)
    const subject = req.body.custom_subject || emailService.getSubject(
      order.order_number || '', 
      'caterer', 
      purpose, 
      airportCode, 
      order.status,
      order.delivery_date,
      order.delivery_time
    );
    const body = req.body.custom_message || template.body('Team');

    // Generate HTML email
    const html = emailService.generateEmailHTML(body, order.order_number || '');

    // Caterer always gets PDF B (without pricing) with 'caterer' recipient type to show revision
    const pdfResult = await orderService.getOrCreateOrderPdfB(id, 'caterer');

    // Get CC emails from request body
    const ccEmails = req.body.cc_emails && Array.isArray(req.body.cc_emails) 
      ? req.body.cc_emails.filter((e: string) => e && e.trim())
      : undefined;

    // Send email
    const result = await emailService.sendEmail({
      to: catererEmail,
      cc: ccEmails,
      subject,
      html,
      attachments: [{
        filename: pdfResult.filename,
        content: pdfResult.buffer,
        contentType: 'application/pdf',
      }],
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // Update status if requested
    let statusUpdated = false;
    if (req.body.update_status) {
      const validStatuses = ['awaiting_quote', 'awaiting_client_approval', 'awaiting_caterer', 'caterer_confirmed', 'in_preparation', 'ready_for_delivery', 'delivered', 'paid', 'cancelled', 'order_changed'];
      if (validStatuses.includes(req.body.update_status)) {
        // Only ADMIN can set status to 'paid'
        if (req.body.update_status === 'paid' && req.user!.role !== 'ADMIN') {
          return res.status(403).json({ error: 'Only administrators can set order status to paid' });
        }
        
        const updatedOrder = await orderService.updateOrderStatus(id, { status: req.body.update_status });
        if (updatedOrder) {
          order = updatedOrder;
          statusUpdated = true;
        }
      }
    }

    Logger.info('Email sent to caterer', {
      orderId: id,
      orderNumber: order.order_number,
      recipient: catererEmail,
      status: order.status,
      statusUpdated,
      pdfFormat,
      purpose,
    });

    res.json({
      message: 'Email sent to caterer successfully',
      recipient: catererEmail,
      order_number: order.order_number,
      status: order.status,
      status_updated: statusUpdated,
      pdf_format: pdfFormat,
      purpose,
      sent_at: new Date().toISOString(),
      messageId: result.messageId,
    });
  } catch (error: any) {
    Logger.error('Failed to send email to caterer', error, {
      method: 'POST',
      url: `/orders/${req.params.id}/send-to-caterer`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/{id}/send-to-both:
 *   post:
 *     summary: Send order email to both client and caterer
 *     description: Sends separate emails to both client and caterer with the order PDF attached. Each email uses a template based on order status.
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               custom_client_message:
 *                 type: string
 *                 description: Optional custom message for client email
 *               custom_caterer_message:
 *                 type: string
 *                 description: Optional custom message for caterer email
 *     responses:
 *       200:
 *         description: Emails sent successfully
 *       400:
 *         description: Email not configured or recipient emails not found
 *       404:
 *         description: Order not found
 */
orderRouter.post('/:id/send-to-both', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    let order = await orderService.getOrderById(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const emailService = getEmailService();
    if (!emailService.isConfigured()) {
      return res.status(400).json({ error: 'Email service is not configured' });
    }

    // Get both emails
    const clientEmail = order.client?.email;
    const catererEmail = order.caterer_details?.caterer_email;

    const errors: string[] = [];
    if (!clientEmail) errors.push('No email address found for client');
    if (!catererEmail) errors.push('No email address found for caterer');

    if (errors.length === 2) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    // Get both PDF formats
    const pdfA = await orderService.getOrCreateOrderPdf(id); // With pricing (for client)
    const pdfBForClient = await orderService.getOrCreateOrderPdfB(id, 'client'); // Without pricing for client (shows status)
    const pdfBForCaterer = await orderService.getOrCreateOrderPdfB(id, 'caterer'); // Without pricing for caterer (shows revision)

    const results: any = {
      client: null,
      caterer: null,
    };

    // Send to client if email available
    if (clientEmail) {
      const clientFirstName = order.client?.full_name?.split(' ')[0] || 'Valued Customer';
      const clientTemplate = emailService.getTemplate('client', order.status || 'default');
      
      // Use template's purpose and pdfFormat
      const clientPurpose = req.body.client_purpose || clientTemplate.purpose;
      
      // Only ADMIN can send final invoice
      const isInvoice = order.status === 'paid' || clientPurpose === 'invoice';
      if (isInvoice && req.user!.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Only administrators can send final invoice emails' });
      }
      
      const clientPdfFormat = clientTemplate.pdfFormat;
      
      // Get airport code for subject line
      const airportCode = order.airport_details?.airport_code_iata || 
        order.airport_details?.airport_code_icao || 
        (order.airport && order.airport.length <= 10 ? order.airport : '') || 
        '';
      
      const clientSubject = req.body.custom_client_subject || emailService.getSubject(
        order.order_number || '', 
        'client', 
        clientPurpose,
        airportCode,
        order.status,
        order.delivery_date,
        order.delivery_time
      );
      const clientBody = req.body.custom_client_message || clientTemplate.body(clientFirstName);
      const clientHtml = emailService.generateEmailHTML(clientBody, order.order_number || '');
      
      // Use appropriate PDF format for client (with status, not revision)
      // Delivered orders always use PDF B (no pricing) with client info
      const usePdfBForClient = order.status === 'delivered' || clientPdfFormat === 'B';
      const clientPdf = usePdfBForClient ? pdfBForClient : pdfA;

      // Get CC emails from request body
      const ccEmails = req.body.cc_emails && Array.isArray(req.body.cc_emails) 
        ? req.body.cc_emails.filter((e: string) => e && e.trim())
        : undefined;

      const clientResult = await emailService.sendEmail({
        to: clientEmail,
        cc: ccEmails,
        subject: clientSubject,
        html: clientHtml,
        attachments: [{
          filename: clientPdf.filename,
          content: clientPdf.buffer,
          contentType: 'application/pdf',
        }],
      });

      results.client = {
        success: clientResult.success,
        email: clientEmail,
        messageId: clientResult.messageId,
        error: clientResult.error,
        pdf_format: clientPdfFormat,
        purpose: clientPurpose,
      };
    }

    // Send to caterer if email available (always PDF B - no pricing)
    if (catererEmail) {
      const catererTemplate = emailService.getTemplate('caterer', order.status || 'default');
      const catererPurpose = req.body.caterer_purpose || catererTemplate.purpose;
      
      // Get airport code for subject line
      const catererAirportCode = order.airport_details?.airport_code_iata || 
        order.airport_details?.airport_code_icao || 
        (order.airport && order.airport.length <= 10 ? order.airport : '') || 
        '';
      
      const catererSubject = req.body.custom_caterer_subject || emailService.getSubject(
        order.order_number || '', 
        'caterer', 
        catererPurpose,
        catererAirportCode,
        order.status,
        order.delivery_date,
        order.delivery_time
      );
      const catererBody = req.body.custom_caterer_message || catererTemplate.body('Team');
      const catererHtml = emailService.generateEmailHTML(catererBody, order.order_number || '');

      // Get CC emails from request body (same CC list for both if sending to both)
      const catererCcEmails = req.body.cc_emails && Array.isArray(req.body.cc_emails) 
        ? req.body.cc_emails.filter((e: string) => e && e.trim())
        : undefined;

      const catererResult = await emailService.sendEmail({
        to: catererEmail,
        cc: catererCcEmails,
        subject: catererSubject,
        html: catererHtml,
        attachments: [{
          filename: pdfBForCaterer.filename,
          content: pdfBForCaterer.buffer,
          contentType: 'application/pdf',
        }],
      });

      results.caterer = {
        success: catererResult.success,
        email: catererEmail,
        messageId: catererResult.messageId,
        error: catererResult.error,
        pdf_format: 'B',
        purpose: catererPurpose,
      };
    }

    Logger.info('Emails sent to both client and caterer', {
      orderId: id,
      orderNumber: order.order_number,
      clientEmail,
      catererEmail,
      status: order.status,
    });

    res.json({
      message: 'Emails processed',
      order_number: order.order_number,
      status: order.status,
      sent_at: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    Logger.error('Failed to send emails to both', error, {
      method: 'POST',
      url: `/orders/${req.params.id}/send-to-both`,
      orderId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /orders/history:
 *   get:
 *     summary: Get order history
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: client_name
 *         schema:
 *           type: string
 *       - in: query
 *         name: caterer
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order history
 */
orderRouter.get('/history', requirePermission('orders.read'), async (req: Request, res: Response) => {
  try {
    const params: OrderSearchParams = {
      search: req.query.search as string,
      status: req.query.status as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      client_name: req.query.client_name as string,
      caterer: req.query.caterer as string,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await orderService.getOrderHistory(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to get order history', error, {
      method: 'GET',
      url: '/orders/history',
      query: req.query,
    });
    res.status(500).json({ error: error.message });
  }
});

// Helper functions moved to src/utils/order-pdf.ts
