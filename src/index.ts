import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';
import path from 'path';
import { setupSwagger } from './config/swagger';
import { initializeDatabase } from './database';
import { requestLogger, errorLogger } from './middleware/logger.middleware';
import { Logger } from './utils/logger';
import { env } from './config/env';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Request logging middleware (must be before other middleware)
app.use(requestLogger);

// CORS configuration with credentials support
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Allowed origins - include common localhost ports for development
    const allowedOrigins = [
      env.FRONTEND_URL,
      'http://localhost:3000', // Explicitly allowed for local development
      'http://localhost:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://68.183.155.95:3001',
      'https://68.183.155.95:3001',
    ];
    
    // In development, allow localhost origins on any port
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (isDevelopment && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return callback(null, true);
    }
    
    // Check if origin matches allowed origins
    if (allowedOrigins.includes(origin) || origin.startsWith(env.FRONTEND_URL)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
};

// Middleware
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets (logo, etc.)
app.use('/assets', express.static(path.join(__dirname, '..', 'src', 'assets')));

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('Database initialized successfully');

    // Load routes after database is ready to avoid premature repository access
    const { healthRouter } = await import('./routes/health');
    const { authRouter } = await import('./routes/auth');
    const { invitesRouter } = await import('./routes/invites');
    const { employeesRouter } = await import('./routes/employees');
    const { airportRouter } = await import('./routes/airports');
    const { catererRouter } = await import('./routes/caterers');
    const { clientRouter } = await import('./routes/clients');
    const { orderRouter } = await import('./routes/orders');
    const { menuItemRouter } = await import('./routes/menu-items');
    const { categoryRouter } = await import('./routes/categories');
    const { addonItemRouter } = await import('./routes/addon-items');
    const { inventoryRouter } = await import('./routes/inventory');
    const { taxChargeRouter } = await import('./routes/tax-charges');
    const { fboRouter } = await import('./routes/fbos');
    const { paymentRouter, publicPaymentRouter } = await import('./routes/payments');
    const { invoiceRouter } = await import('./routes/invoices');
    const { webhookRouter } = await import('./routes/webhooks');

    // Swagger Documentation
    const swaggerSpec = setupSwagger();
    app.get('/api-docs/swagger.json', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'application/json');
      res.send(swaggerSpec);
    });
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    // Public routes (no auth required)
    app.use('/health', healthRouter);
    app.use('/auth', authRouter);
    app.use('/invites', invitesRouter);
    
    // Public Square Application ID endpoint (no auth required - safe to expose)
    app.get('/payments/application-id', async (req: Request, res: Response) => {
      try {
        const applicationId = process.env.SQUARE_APPLICATION_ID;
        if (!applicationId) {
          return res.status(500).json({
            error: 'Square application ID not configured',
          });
        }
        return res.json({
          application_id: applicationId,
          environment: process.env.SQUARE_ENVIRONMENT || 'sandbox',
        });
      } catch (error: any) {
        Logger.error('Failed to get Square application ID', error);
        return res.status(500).json({
          error: error.message || 'Failed to retrieve Square application ID',
        });
      }
    });
    
    app.use('/', publicPaymentRouter); // Other public payment routes
    
    // Webhook routes (no auth required - Square calls these directly)
    app.use('/webhooks', webhookRouter);
    
    // Protected routes (require authentication)
    app.use('/employees', employeesRouter);
    app.use('/airports', airportRouter);
    app.use('/caterers', catererRouter);
    app.use('/clients', clientRouter);
    app.use('/orders', orderRouter);
    app.use('/menu-items', menuItemRouter);
    app.use('/categories', categoryRouter);
    app.use('/addon-items', addonItemRouter);
    app.use('/inventory', inventoryRouter);
    app.use('/tax-charges', taxChargeRouter);
    app.use('/fbos', fboRouter);
    app.use('/', paymentRouter); // Payment routes are prefixed in the router
    app.use('/', invoiceRouter); // Invoice routes are prefixed in the router

    // Root endpoint
    app.get('/', (req: Request, res: Response) => {
      res.json({
        message: 'Welcome to Kabin247 API',
        documentation: '/api-docs',
        health: '/health',
        airports: '/airports',
        caterers: '/caterers',
        clients: '/clients',
        orders: '/orders',
        menuItems: '/menu-items',
        categories: '/categories',
        addonItems: '/addon-items',
        inventory: '/inventory',
        taxCharges: '/tax-charges',
        fbos: '/fbos'
      });
    });

    // Error handling middleware (must be after all routes)
    app.use(errorLogger);

    // Global error handler
    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      Logger.error('Unhandled application error', err, {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip || req.socket.remoteAddress,
      });

      res.status(500).json({
        error: process.env.NODE_ENV === 'production' 
          ? 'Internal server error' 
          : err.message,
      });
    });
    
    // Initialize order status scheduler
    const { OrderService } = await import('./services/order.service');
    const { getOrderScheduler } = await import('./services/order-scheduler.service');
    const orderService = new OrderService();
    const scheduler = getOrderScheduler(orderService);
    scheduler.start();
    Logger.info('Order status scheduler started');

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
      console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;

