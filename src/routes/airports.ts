import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AirportService } from '../services/airport.service';
import { CreateAirportDTO, AirportSearchParams } from '../models/airport';
import { Logger } from '../utils/logger';

export const airportRouter = Router();
const airportService = new AirportService();

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
 *     Airport:
 *       type: object
 *       required:
 *         - airport_name
 *         - fbo_name
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-generated primary key
 *         airport_name:
 *           type: string
 *           description: Name of the airport
 *         fbo_name:
 *           type: string
 *           description: Fixed Base Operator name
 *         fbo_email:
 *           type: string
 *           format: email
 *           description: FBO email address
 *         fbo_phone:
 *           type: string
 *           description: FBO phone number
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
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     CreateAirport:
 *       type: object
 *       required:
 *         - airport_name
 *         - fbo_name
 *       properties:
 *         airport_name:
 *           type: string
 *         fbo_name:
 *           type: string
 *         fbo_email:
 *           type: string
 *           format: email
 *         fbo_phone:
 *           type: string
 *         airport_code_iata:
 *           type: string
 *           pattern: '^[A-Z]{3}$'
 *         airport_code_icao:
 *           type: string
 *           pattern: '^[A-Z]{4}$'
 */

/**
 * @swagger
 * /airports:
 *   post:
 *     summary: Create a new airport
 *     tags: [Airports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAirport'
 *     responses:
 *       201:
 *         description: Airport created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Airport'
 *       400:
 *         description: Validation error
 */
airportRouter.post('/', async (req: Request, res: Response) => {
  try {
    const airportData: CreateAirportDTO = req.body;
    const airport = await airportService.createAirport(airportData);
    res.status(201).json(airport);
  } catch (error: any) {
    Logger.error('Failed to create airport', error, {
      method: 'POST',
      url: '/airports',
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /airports:
 *   get:
 *     summary: List airports with pagination, search, and sorting
 *     tags: [Airports]
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
 *           enum: [id, airport_name, fbo_name, airport_code_iata, airport_code_icao, created_at, updated_at]
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
 *         description: List of airports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 airports:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Airport'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 */
airportRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: AirportSearchParams = {
      search: req.query.search as string,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    };
    const result = await airportService.listAirports(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list airports', error, {
      method: 'GET',
      url: '/airports',
      query: req.query,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /airports/{id}:
 *   get:
 *     summary: Get airport by ID
 *     tags: [Airports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Airport found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Airport'
 *       404:
 *         description: Airport not found
 */
airportRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const airport = await airportService.getAirportById(id);
    if (!airport) {
      Logger.warn('Airport not found', {
        method: 'GET',
        url: `/airports/${id}`,
        airportId: id,
      });
      return res.status(404).json({ error: 'Airport not found' });
    }
    res.json(airport);
  } catch (error: any) {
    Logger.error('Failed to get airport by ID', error, {
      method: 'GET',
      url: `/airports/${req.params.id}`,
      airportId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /airports/{id}:
 *   delete:
 *     summary: Delete a single airport
 *     tags: [Airports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Airport deleted successfully
 *       404:
 *         description: Airport not found
 */
airportRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await airportService.deleteAirport(id);
    if (!deleted) {
      Logger.warn('Airport not found for deletion', {
        method: 'DELETE',
        url: `/airports/${id}`,
        airportId: id,
      });
      return res.status(404).json({ error: 'Airport not found' });
    }
    res.json({ message: 'Airport deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete airport', error, {
      method: 'DELETE',
      url: `/airports/${req.params.id}`,
      airportId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /airports:
 *   delete:
 *     summary: Delete multiple airports (bulk delete)
 *     tags: [Airports]
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
 *         description: Airports deleted successfully
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
airportRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      Logger.warn('Invalid bulk delete request', {
        method: 'DELETE',
        url: '/airports',
        body: req.body,
      });
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await airportService.deleteAirports(ids);
    res.json({ message: 'Airports deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to bulk delete airports', error, {
      method: 'DELETE',
      url: '/airports',
      body: req.body,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /airports/import:
 *   post:
 *     summary: Import airports from Excel file
 *     tags: [Airports]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         required: true
 *         description: Excel file (.xlsx or .xls) with airport data
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
airportRouter.post('/import', (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      Logger.error('File upload error', err, {
        method: 'POST',
        url: '/airports/import',
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
        url: '/airports/import',
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }

    Logger.info('Starting airport import', {
      method: 'POST',
      url: '/airports/import',
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    const result = await airportService.importFromExcel(req.file.buffer);
    
    if (result.errors.length > 0) {
      Logger.warn('Airport import completed with errors', {
        method: 'POST',
        url: '/airports/import',
        fileName: req.file.originalname,
        success: result.success,
        errorsCount: result.errors.length,
        errors: result.errors, // Log all errors
      });
    } else {
      Logger.info('Airport import completed successfully', {
        method: 'POST',
        url: '/airports/import',
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
    Logger.error('Failed to import airports from Excel', error, {
      method: 'POST',
      url: '/airports/import',
      fileName: req.file?.originalname,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /airports/export:
 *   get:
 *     summary: Export all airports to Excel file
 *     tags: [Airports]
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
airportRouter.get('/export', async (req: Request, res: Response) => {
  try {
    Logger.info('Starting airport export', {
      method: 'GET',
      url: '/airports/export',
    });

    const buffer = await airportService.exportToExcel();
    
    Logger.info('Airport export completed', {
      method: 'GET',
      url: '/airports/export',
      fileSize: buffer.length,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=airports.xlsx');
    res.send(buffer);
  } catch (error: any) {
    Logger.error('Failed to export airports to Excel', error, {
      method: 'GET',
      url: '/airports/export',
    });
    res.status(500).json({ error: error.message });
  }
});

