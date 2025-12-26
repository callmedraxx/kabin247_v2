import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { MenuItemService } from '../services/menu-item.service';
import { CreateMenuItemDTO, UpdateMenuItemDTO, MenuItemSearchParams, MenuItemStatusUpdateDTO } from '../models/menu-item';
import { Logger } from '../utils/logger';

export const menuItemRouter = Router();
const menuItemService = new MenuItemService();

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

menuItemRouter.post('/', async (req: Request, res: Response) => {
  try {
    const menuItemData: CreateMenuItemDTO = req.body;
    const menuItem = await menuItemService.createMenuItem(menuItemData);
    res.status(201).json(menuItem);
  } catch (error: any) {
    Logger.error('Failed to create menu item', error, { method: 'POST', url: '/menu-items', body: req.body });
    res.status(400).json({ error: error.message });
  }
});

menuItemRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: MenuItemSearchParams = {
      search: req.query.search as string,
      category: req.query.category as string,
      food_type: req.query.food_type as string,
      is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await menuItemService.listMenuItems(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list menu items', error, { method: 'GET', url: '/menu-items' });
    res.status(500).json({ error: error.message });
  }
});

menuItemRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const menuItem = await menuItemService.getMenuItemById(id);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json(menuItem);
  } catch (error: any) {
    Logger.error('Failed to get menu item', error, { method: 'GET', url: `/menu-items/${req.params.id}` });
    res.status(500).json({ error: error.message });
  }
});

menuItemRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const menuItemData: UpdateMenuItemDTO = req.body;
    const menuItem = await menuItemService.updateMenuItem(id, menuItemData);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json(menuItem);
  } catch (error: any) {
    Logger.error('Failed to update menu item', error, { method: 'PUT', url: `/menu-items/${req.params.id}` });
    res.status(400).json({ error: error.message });
  }
});

menuItemRouter.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const statusData: MenuItemStatusUpdateDTO = req.body;
    const menuItem = await menuItemService.updateMenuItemStatus(id, statusData);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json({ id: menuItem.id, is_active: menuItem.is_active, updated_at: menuItem.updated_at });
  } catch (error: any) {
    Logger.error('Failed to update menu item status', error, { method: 'PATCH', url: `/menu-items/${req.params.id}/status` });
    res.status(400).json({ error: error.message });
  }
});

menuItemRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await menuItemService.deleteMenuItem(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json({ message: 'Menu item deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete menu item', error, { method: 'DELETE', url: `/menu-items/${req.params.id}` });
    res.status(500).json({ error: error.message });
  }
});

menuItemRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await menuItemService.deleteMenuItems(ids);
    res.json({ message: 'Menu items deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to delete menu items', error, { method: 'DELETE', url: '/menu-items' });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /menu-items/import:
 *   post:
 *     summary: Import menu items from Excel file
 *     tags: [Menu Items]
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: file
 *         type: file
 *         required: true
 *         description: Excel file (.xlsx or .xls) with menu item data
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
menuItemRouter.post('/import', (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      Logger.error('File upload error', err, {
        method: 'POST',
        url: '/menu-items/import',
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
        url: '/menu-items/import',
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }

    Logger.info('Starting menu items import', {
      method: 'POST',
      url: '/menu-items/import',
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    const result = await menuItemService.importFromExcel(req.file.buffer);
    
    if (result.errors.length > 0) {
      Logger.warn('Menu items import completed with errors', {
        method: 'POST',
        url: '/menu-items/import',
        fileName: req.file.originalname,
        success: result.success,
        errorsCount: result.errors.length,
        errors: result.errors,
      });
    } else {
      Logger.info('Menu items import completed successfully', {
        method: 'POST',
        url: '/menu-items/import',
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
    Logger.error('Failed to import menu items from Excel', error, {
      method: 'POST',
      url: '/menu-items/import',
      fileName: req.file?.originalname,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /menu-items/export:
 *   get:
 *     summary: Export all menu items to Excel file
 *     tags: [Menu Items]
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
menuItemRouter.get('/export', async (req: Request, res: Response) => {
  try {
    Logger.info('Starting menu items export', {
      method: 'GET',
      url: '/menu-items/export',
    });

    const buffer = await menuItemService.exportToExcel();
    
    Logger.info('Menu items export completed', {
      method: 'GET',
      url: '/menu-items/export',
      fileSize: buffer.length,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=menu-items.xlsx');
    res.send(buffer);
  } catch (error: any) {
    Logger.error('Failed to export menu items to Excel', error, {
      method: 'GET',
      url: '/menu-items/export',
    });
    res.status(500).json({ error: error.message });
  }
});
