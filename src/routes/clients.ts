import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ClientService } from '../services/client.service';
import { CreateClientDTO, ClientSearchParams } from '../models/client';
import { Logger } from '../utils/logger';

export const clientRouter = Router();
const clientService = new ClientService();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  },
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Client:
 *       type: object
 *       required:
 *         - full_name
 *         - full_address
 *         - email
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-generated primary key
 *         full_name:
 *           type: string
 *           description: Full name of the client
 *         full_address:
 *           type: string
 *           description: Full address of the client
 *         email:
 *           type: string
 *           format: email
 *           description: Client email address
 *         contact_number:
 *           type: string
 *           description: Client contact number
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     CreateClient:
 *       type: object
 *       required:
 *         - full_name
 *         - full_address
 *         - email
 *       properties:
 *         full_name:
 *           type: string
 *         full_address:
 *           type: string
 *         email:
 *           type: string
 *           format: email
 *         contact_number:
 *           type: string
 */

/**
 * @swagger
 * /clients:
 *   post:
 *     summary: Create a new client
 *     tags: [Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateClient'
 *     responses:
 *       201:
 *         description: Client created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Client'
 *       400:
 *         description: Validation error or duplicate client
 */
clientRouter.post('/', async (req: Request, res: Response) => {
  try {
    const clientData: CreateClientDTO = req.body;
    const client = await clientService.createClient(clientData);
    res.status(201).json(client);
  } catch (error: any) {
    Logger.error('Failed to create client', error, {
      method: 'POST',
      url: '/clients',
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /clients:
 *   get:
 *     summary: List clients with pagination, search, and sorting
 *     tags: [Clients]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term (searches across all fields)
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [id, full_name, full_address, email, contact_number, created_at, updated_at]
 *         description: Field to sort by
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of items per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of clients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clients:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Client'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 */
clientRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: ClientSearchParams = {
      search: req.query.search as string,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const result = await clientService.listClients(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list clients', error, {
      method: 'GET',
      url: '/clients',
      query: req.query,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /clients/{id}:
 *   get:
 *     summary: Get client by ID
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Client found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Client'
 *       404:
 *         description: Client not found
 */
clientRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const client = await clientService.getClientById(id);
    if (!client) {
      Logger.warn('Client not found', {
        method: 'GET',
        url: `/clients/${id}`,
        clientId: id,
      });
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(client);
  } catch (error: any) {
    Logger.error('Failed to get client by ID', error, {
      method: 'GET',
      url: `/clients/${req.params.id}`,
      clientId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /clients/{id}:
 *   put:
 *     summary: Update a client
 *     tags: [Clients]
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
 *               full_name:
 *                 type: string
 *               full_address:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               contact_number:
 *                 type: string
 *     responses:
 *       200:
 *         description: Client updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Client'
 *       404:
 *         description: Client not found
 *       400:
 *         description: Validation error or duplicate client
 */
clientRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const clientData: Partial<CreateClientDTO> = req.body;
    const client = await clientService.updateClient(id, clientData);
    if (!client) {
      Logger.warn('Client not found for update', {
        method: 'PUT',
        url: `/clients/${id}`,
        clientId: id,
      });
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json(client);
  } catch (error: any) {
    Logger.error('Failed to update client', error, {
      method: 'PUT',
      url: `/clients/${req.params.id}`,
      clientId: req.params.id,
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /clients/{id}:
 *   delete:
 *     summary: Delete a client
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Client deleted successfully
 *       404:
 *         description: Client not found
 */
clientRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await clientService.deleteClient(id);
    if (!deleted) {
      Logger.warn('Client not found for deletion', {
        method: 'DELETE',
        url: `/clients/${id}`,
        clientId: id,
      });
      return res.status(404).json({ error: 'Client not found' });
    }
    res.json({ message: 'Client deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete client', error, {
      method: 'DELETE',
      url: `/clients/${req.params.id}`,
      clientId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /clients:
 *   delete:
 *     summary: Bulk delete clients
 *     tags: [Clients]
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
 *         description: Clients deleted successfully
 *       400:
 *         description: Invalid request
 */
clientRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await clientService.deleteClients(ids);
    res.json({ message: 'Clients deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to delete clients', error, {
      method: 'DELETE',
      url: '/clients',
      body: req.body,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /clients/import:
 *   post:
 *     summary: Import clients from Excel file
 *     tags: [Clients]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         required: true
 *         description: Excel file (.xlsx or .xls) with client data
 *     responses:
 *       200:
 *         description: Import completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 success:
 *                   type: integer
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: string
 *       400:
 *         description: Invalid file or validation errors
 */
clientRouter.post('/import', (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      Logger.error('File upload error', err, {
        method: 'POST',
        url: '/clients/import',
      });
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    next();
  });
}, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      Logger.warn('No file uploaded for import', {
        method: 'POST',
        url: '/clients/import',
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }

    Logger.info('Starting client import', {
      method: 'POST',
      url: '/clients/import',
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    const result = await clientService.importFromExcel(req.file.buffer);
    
    if (result.errors.length > 0) {
      Logger.warn('Client import completed with errors', {
        method: 'POST',
        url: '/clients/import',
        fileName: req.file.originalname,
        success: result.success,
        errorsCount: result.errors.length,
        errors: result.errors,
      });
    } else {
      Logger.info('Client import completed successfully', {
        method: 'POST',
        url: '/clients/import',
        fileName: req.file.originalname,
        success: result.success,
        errorsCount: result.errors.length,
      });
    }

    res.json({
      message: 'Import completed',
      success: result.success,
      errors: result.errors,
    });
  } catch (error: any) {
    Logger.error('Failed to import clients from Excel', error, {
      method: 'POST',
      url: '/clients/import',
      fileName: req.file?.originalname,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /clients/export:
 *   get:
 *     summary: Export all clients to Excel file
 *     tags: [Clients]
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
clientRouter.get('/export', async (req: Request, res: Response) => {
  try {
    const buffer = await clientService.exportToExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=clients.xlsx');
    res.send(buffer);
  } catch (error: any) {
    Logger.error('Failed to export clients to Excel', error, {
      method: 'GET',
      url: '/clients/export',
    });
    res.status(500).json({ error: error.message });
  }
});
