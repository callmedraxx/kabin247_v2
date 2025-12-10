import { Router, Request, Response } from 'express';
import { AddonItemService } from '../services/addon-item.service';
import { CreateAddonItemDTO, UpdateAddonItemDTO, AddonItemSearchParams } from '../models/addon-item';
import { Logger } from '../utils/logger';

export const addonItemRouter = Router();
const addonItemService = new AddonItemService();

addonItemRouter.post('/', async (req: Request, res: Response) => {
  try {
    const addonItemData: CreateAddonItemDTO = req.body;
    const addonItem = await addonItemService.createAddonItem(addonItemData);
    res.status(201).json(addonItem);
  } catch (error: any) {
    Logger.error('Failed to create addon item', error, { method: 'POST', url: '/addon-items', body: req.body });
    res.status(400).json({ error: error.message });
  }
});

addonItemRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: AddonItemSearchParams = {
      search: req.query.search as string,
      category: req.query.category as string,
      is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await addonItemService.listAddonItems(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list addon items', error, { method: 'GET', url: '/addon-items' });
    res.status(500).json({ error: error.message });
  }
});

addonItemRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const addonItem = await addonItemService.getAddonItemById(id);
    if (!addonItem) {
      return res.status(404).json({ error: 'Addon item not found' });
    }
    res.json(addonItem);
  } catch (error: any) {
    Logger.error('Failed to get addon item', error, { method: 'GET', url: `/addon-items/${req.params.id}` });
    res.status(500).json({ error: error.message });
  }
});

addonItemRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const addonItemData: UpdateAddonItemDTO = req.body;
    const addonItem = await addonItemService.updateAddonItem(id, addonItemData);
    if (!addonItem) {
      return res.status(404).json({ error: 'Addon item not found' });
    }
    res.json(addonItem);
  } catch (error: any) {
    Logger.error('Failed to update addon item', error, { method: 'PUT', url: `/addon-items/${req.params.id}` });
    res.status(400).json({ error: error.message });
  }
});

addonItemRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await addonItemService.deleteAddonItem(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Addon item not found' });
    }
    res.json({ message: 'Addon item deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete addon item', error, { method: 'DELETE', url: `/addon-items/${req.params.id}` });
    res.status(500).json({ error: error.message });
  }
});

addonItemRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await addonItemService.deleteAddonItems(ids);
    res.json({ message: 'Addon items deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to delete addon items', error, { method: 'DELETE', url: '/addon-items' });
    res.status(500).json({ error: error.message });
  }
});
