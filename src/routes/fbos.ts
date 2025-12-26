import { Router, Request, Response } from 'express';
import { FBOService } from '../services/fbo.service';
import { CreateFBODTO, FBOSearchParams } from '../models/fbo';
import { Logger } from '../utils/logger';

export const fboRouter = Router();
const fboService = new FBOService();

/**
 * @swagger
 * components:
 *   schemas:
 *     FBO:
 *       type: object
 *       required:
 *         - fbo_name
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-generated primary key
 *         fbo_name:
 *           type: string
 *           description: Name of the FBO
 *         fbo_email:
 *           type: string
 *           format: email
 *           description: FBO email address
 *         fbo_phone:
 *           type: string
 *           description: FBO phone number
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     CreateFBO:
 *       type: object
 *       required:
 *         - fbo_name
 *       properties:
 *         fbo_name:
 *           type: string
 *           example: "Signature Flight Support"
 *         fbo_email:
 *           type: string
 *           format: email
 *           example: "contact@signatureflight.com"
 *         fbo_phone:
 *           type: string
 *           example: "+1-555-123-4567"
 */

/**
 * @swagger
 * /fbos:
 *   post:
 *     summary: Create a new FBO
 *     tags: [FBOs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateFBO'
 *           examples:
 *             basicFBO:
 *               summary: Basic FBO with required fields only
 *               value:
 *                 fbo_name: "Signature Flight Support"
 *             completeFBO:
 *               summary: Complete FBO with all fields
 *               value:
 *                 fbo_name: "Atlantic Aviation"
 *                 fbo_email: "contact@atlanticaviation.com"
 *                 fbo_phone: "+1-555-123-4567"
 *             anotherFBO:
 *               summary: Another FBO example
 *               value:
 *                 fbo_name: "Jet Aviation"
 *                 fbo_email: "info@jetaviation.com"
 *                 fbo_phone: "305-555-7890"
 *     responses:
 *       201:
 *         description: FBO created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FBO'
 *             examples:
 *               success:
 *                 summary: FBO created successfully
 *                 value:
 *                   id: 1
 *                   fbo_name: "Signature Flight Support"
 *                   fbo_email: null
 *                   fbo_phone: null
 *                   created_at: "2024-12-12T11:00:00.000Z"
 *                   updated_at: "2024-12-12T11:00:00.000Z"
 *       400:
 *         description: Validation error
 */
fboRouter.post('/', async (req: Request, res: Response) => {
  try {
    const fboData: CreateFBODTO = req.body;
    const fbo = await fboService.createFBO(fboData);
    res.status(201).json(fbo);
  } catch (error: any) {
    Logger.error('Failed to create FBO', error, {
      method: 'POST',
      url: '/fbos',
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /fbos:
 *   get:
 *     summary: List FBOs with pagination, search, and sorting
 *     tags: [FBOs]
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
 *           enum: [id, fbo_name, fbo_email, fbo_phone, created_at, updated_at]
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
 *     responses:
 *       200:
 *         description: List of FBOs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fbos:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FBO'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 */
fboRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: FBOSearchParams = {
      search: req.query.search as string,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await fboService.listFBOs(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list FBOs', error, {
      method: 'GET',
      url: '/fbos',
      query: req.query,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /fbos/{id}:
 *   get:
 *     summary: Get FBO by ID
 *     tags: [FBOs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: FBO found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FBO'
 *       404:
 *         description: FBO not found
 */
fboRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const fbo = await fboService.getFBOById(id);
    if (!fbo) {
      Logger.warn('FBO not found', {
        method: 'GET',
        url: `/fbos/${id}`,
        fboId: id,
      });
      return res.status(404).json({ error: 'FBO not found' });
    }
    res.json(fbo);
  } catch (error: any) {
    Logger.error('Failed to get FBO by ID', error, {
      method: 'GET',
      url: `/fbos/${req.params.id}`,
      fboId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /fbos/{id}:
 *   put:
 *     summary: Update an FBO
 *     tags: [FBOs]
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
 *               fbo_name:
 *                 type: string
 *               fbo_email:
 *                 type: string
 *                 format: email
 *               fbo_phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: FBO updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FBO'
 *       400:
 *         description: Validation error
 *       404:
 *         description: FBO not found
 */
fboRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const fboData: Partial<CreateFBODTO> = req.body;
    const fbo = await fboService.updateFBO(id, fboData);
    if (!fbo) {
      Logger.warn('FBO not found for update', {
        method: 'PUT',
        url: `/fbos/${id}`,
        fboId: id,
      });
      return res.status(404).json({ error: 'FBO not found' });
    }
    res.json(fbo);
  } catch (error: any) {
    Logger.error('Failed to update FBO', error, {
      method: 'PUT',
      url: `/fbos/${req.params.id}`,
      fboId: req.params.id,
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /fbos/{id}:
 *   delete:
 *     summary: Delete an FBO
 *     tags: [FBOs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: FBO deleted successfully
 *       404:
 *         description: FBO not found
 */
fboRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await fboService.deleteFBO(id);
    if (!deleted) {
      Logger.warn('FBO not found for deletion', {
        method: 'DELETE',
        url: `/fbos/${id}`,
        fboId: id,
      });
      return res.status(404).json({ error: 'FBO not found' });
    }
    res.json({ message: 'FBO deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete FBO', error, {
      method: 'DELETE',
      url: `/fbos/${req.params.id}`,
      fboId: req.params.id,
    });
    res.status(500).json({ error: error.message });
  }
});
