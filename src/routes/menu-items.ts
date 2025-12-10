import { Router, Request, Response } from 'express';
import { MenuItemService } from '../services/menu-item.service';
import { CreateMenuItemDTO, UpdateMenuItemDTO, MenuItemSearchParams, MenuItemStatusUpdateDTO } from '../models/menu-item';
import { Logger } from '../utils/logger';

export const menuItemRouter = Router();
const menuItemService = new MenuItemService();

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
