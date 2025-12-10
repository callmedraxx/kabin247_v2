import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import dotenv from 'dotenv';
import { setupSwagger } from './config/swagger';
import { initializeDatabase } from './database';
import { healthRouter } from './routes/health';
import { airportRouter } from './routes/airports';
import { catererRouter } from './routes/caterers';
import { clientRouter } from './routes/clients';
import { orderRouter } from './routes/orders';
import { menuItemRouter } from './routes/menu-items';
import { categoryRouter } from './routes/categories';
import { addonItemRouter } from './routes/addon-items';
import { inventoryRouter } from './routes/inventory';
import { taxChargeRouter } from './routes/tax-charges';
import { requestLogger, errorLogger } from './middleware/logger.middleware';
import { Logger } from './utils/logger';

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Request logging middleware (must be before other middleware)
app.use(requestLogger);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger Documentation
const swaggerSpec = setupSwagger();
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/health', healthRouter);
app.use('/airports', airportRouter);
app.use('/caterers', catererRouter);
app.use('/clients', clientRouter);
app.use('/orders', orderRouter);
app.use('/menu-items', menuItemRouter);
app.use('/categories', categoryRouter);
app.use('/addon-items', addonItemRouter);
app.use('/inventory', inventoryRouter);
app.use('/tax-charges', taxChargeRouter);

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
    taxCharges: '/tax-charges'
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

// Initialize database and start server
async function startServer() {
  try {
    await initializeDatabase();
    console.log('Database initialized successfully');
    
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

