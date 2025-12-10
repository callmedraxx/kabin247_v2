import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { CatererService } from '../services/caterer.service';
import { CreateCatererDTO, CatererSearchParams } from '../models/caterer';
import { Logger } from '../utils/logger';

export const catererRouter = Router();
const catererService = new CatererService();

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
 *     Caterer:
 *       type: object
 *       required:
 *         - caterer_name
 *         - caterer_number
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-generated primary key
 *         caterer_name:
 *           type: string
 *           description: Name of the caterer
 *         caterer_number:
 *           type: string
 *           description: Caterer contact number
 *         caterer_email:
 *           type: string
 *           format: email
 *           description: Caterer email address
 *         airport_code_iata:
 *           type: string
 *           pattern: '^[A-Z]{3}$'
 *           description: IATA code (3 uppercase letters)
 *           example: JFK
 *         airport_code_icao:
 *           type: string
 *           pattern: '^[A-Z]{4}$'
 *           description: ICAO code (4 uppercase letters)
 *           example: KJFK
 *         time_zone:
 *           type: string
 *           description: Time zone
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     CreateCaterer:
 *       type: object
 *       required:
 *         - caterer_name
 *         - caterer_number
 *       properties:
 *         caterer_name:
 *           type: string
 *         caterer_number:
 *           type: string
 *         caterer_email:
 *           type: string
 *           format: email
 *         airport_code_iata:
 *           type: string
 *           pattern: '^[A-Z]{3}$'
 *         airport_code_icao:
 *           type: string
 *           pattern: '^[A-Z]{4}$'
 *         time_zone:
 *           type: string
 */

/**
 * @swagger
 * /caterers:
 *   post:
 *     summary: Create a new caterer
 *     tags: [Caterers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCaterer'
 *     responses:
 *       201:
 *         description: Caterer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Caterer'
 *       400:
 *         description: Validation error or duplicate caterer
 */
catererRouter.post('/', async (req: Request, res: Response) => {
  try {
    const catererData: CreateCatererDTO = req.body;
    const caterer = await catererService.createCaterer(catererData);
    res.status(201).json(caterer);
  } catch (error: any) {
    Logger.error('Failed to create caterer', error, {
      method: 'POST',
      url: '/caterers',
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /caterers:
 *   get:
 *     summary: List caterers with pagination, search, and sorting
 *     tags: [Caterers]
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
 *           enum: [id, caterer_name, caterer_number, caterer_email, airport_code_iata, airport_code_icao, time_zone, created_at, updated_at]
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
 *         description: List of caterers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 caterers:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Caterer'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 */
catererRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: CatererSearchParams = {
      search: req.query.search as string,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const result = await catererService.listCaterers(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list caterers', error, {
      method: 'GET',
      url: '/caterers',
      query: req.query,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /caterers/{id}:
 *   get:
 *     summary: Get caterer by ID
 *     tags: [Caterers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Caterer found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Caterer'
 *       404:
 *         description: Caterer not found
 */
catererRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const caterer = await catererService.getCatererById(id);
    if (!caterer) {
      Logger.warn('Caterer not found', {
        method: 'GET',
        url: `/caterers/${id}`,
        catererId: id,
      });
      return res.status(404).json({ error: 'Caterer not found' });
    }
    res.json(caterer);
  } catch (error: any) {
    Logger.error('Failed to get caterer by ID', error, {
      method: 'GET',
      url: `/caterers/${req.params.id}`,
      catererId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /caterers/{id}:
 *   put:
 *     summary: Update a caterer
 *     tags: [Caterers]
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
 *               caterer_name:
 *                 type: string
 *               caterer_number:
 *                 type: string
 *               caterer_email:
 *                 type: string
 *                 format: email
 *               airport_code_iata:
 *                 type: string
 *               airport_code_icao:
 *                 type: string
 *               time_zone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Caterer updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Caterer'
 *       404:
 *         description: Caterer not found
 *       400:
 *         description: Validation error or duplicate caterer
 */
catererRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const catererData: Partial<CreateCatererDTO> = req.body;
    const caterer = await catererService.updateCaterer(id, catererData);
    if (!caterer) {
      Logger.warn('Caterer not found for update', {
        method: 'PUT',
        url: `/caterers/${id}`,
        catererId: id,
      });
      return res.status(404).json({ error: 'Caterer not found' });
    }
    res.json(caterer);
  } catch (error: any) {
    Logger.error('Failed to update caterer', error, {
      method: 'PUT',
      url: `/caterers/${req.params.id}`,
      catererId: req.params.id,
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /caterers/{id}:
 *   delete:
 *     summary: Delete a single caterer
 *     tags: [Caterers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Caterer deleted successfully
 *       404:
 *         description: Caterer not found
 */
catererRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await catererService.deleteCaterer(id);
    if (!deleted) {
      Logger.warn('Caterer not found for deletion', {
        method: 'DELETE',
        url: `/caterers/${id}`,
        catererId: id,
      });
      return res.status(404).json({ error: 'Caterer not found' });
    }
    res.json({ message: 'Caterer deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete caterer', error, {
      method: 'DELETE',
      url: `/caterers/${req.params.id}`,
      catererId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /caterers:
 *   delete:
 *     summary: Delete multiple caterers (bulk delete)
 *     tags: [Caterers]
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
 *         description: Caterers deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deleted:
 *                   type: integer
 */
catererRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      Logger.warn('Invalid bulk delete request', {
        method: 'DELETE',
        url: '/caterers',
        body: req.body,
      });
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await catererService.deleteCaterers(ids);
    res.json({ message: 'Caterers deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to bulk delete caterers', error, {
      method: 'DELETE',
      url: '/caterers',
      body: req.body,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /caterers/import:
 *   post:
 *     summary: Import caterers from Excel file
 *     tags: [Caterers]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         required: true
 *         description: Excel file (.xlsx or .xls) with caterer data
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
catererRouter.post('/import', (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      Logger.error('File upload error', err, {
        method: 'POST',
        url: '/caterers/import',
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
        url: '/caterers/import',
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }

    Logger.info('Starting caterer import', {
      method: 'POST',
      url: '/caterers/import',
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    const result = await catererService.importFromExcel(req.file.buffer);
    
    if (result.errors.length > 0) {
      Logger.warn('Caterer import completed with errors', {
        method: 'POST',
        url: '/caterers/import',
        fileName: req.file.originalname,
        success: result.success,
        errorsCount: result.errors.length,
        errors: result.errors,
      });
    } else {
      Logger.info('Caterer import completed successfully', {
        method: 'POST',
        url: '/caterers/import',
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
    Logger.error('Failed to import caterers from Excel', error, {
      method: 'POST',
      url: '/caterers/import',
      fileName: req.file?.originalname,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /caterers/export:
 *   get:
 *     summary: Export all caterers to Excel file
 *     tags: [Caterers]
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
catererRouter.get('/export', async (req: Request, res: Response) => {
  try {
    Logger.info('Starting caterer export', {
      method: 'GET',
      url: '/caterers/export',
    });

    const buffer = await catererService.exportToExcel();
    
    Logger.info('Caterer export completed', {
      method: 'GET',
      url: '/caterers/export',
      fileSize: buffer.length,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=caterers.xlsx');
    res.send(buffer);
  } catch (error: any) {
    Logger.error('Failed to export caterers to Excel', error, {
      method: 'GET',
      url: '/caterers/export',
    });
    res.status(500).json({ error: error.message });
  }
});

