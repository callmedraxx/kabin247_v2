import { Router, Request, Response } from 'express';
import { InventoryService } from '../services/inventory.service';
import { CreateInventoryItemDTO, UpdateInventoryItemDTO, InventorySearchParams, StockUpdateDTO } from '../models/inventory';
import { Logger } from '../utils/logger';

export const inventoryRouter = Router();
const inventoryService = new InventoryService();

inventoryRouter.post('/', async (req: Request, res: Response) => {
  try {
    const inventoryItemData: CreateInventoryItemDTO = req.body;
    const inventoryItem = await inventoryService.createInventoryItem(inventoryItemData);
    res.status(201).json(inventoryItem);
  } catch (error: any) {
    Logger.error('Failed to create inventory item', error, { method: 'POST', url: '/inventory', body: req.body });
    res.status(400).json({ error: error.message });
  }
});

inventoryRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: InventorySearchParams = {
      search: req.query.search as string,
      category: req.query.category as string,
      status: req.query.status as string,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await inventoryService.listInventoryItems(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list inventory items', error, { method: 'GET', url: '/inventory' });
    res.status(500).json({ error: error.message });
  }
});

inventoryRouter.get('/low-stock', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as 'low_stock' | 'out_of_stock' | undefined;
    const items = await inventoryService.getLowStockItems(status);
    res.json({ inventory_items: items, total: items.length });
  } catch (error: any) {
    Logger.error('Failed to get low stock items', error, { method: 'GET', url: '/inventory/low-stock' });
    res.status(500).json({ error: error.message });
  }
});

inventoryRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const inventoryItem = await inventoryService.getInventoryItemById(id);
    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    res.json(inventoryItem);
  } catch (error: any) {
    Logger.error('Failed to get inventory item', error, { method: 'GET', url: `/inventory/${req.params.id}` });
    res.status(500).json({ error: error.message });
  }
});

inventoryRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const inventoryItemData: UpdateInventoryItemDTO = req.body;
    const inventoryItem = await inventoryService.updateInventoryItem(id, inventoryItemData);
    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    res.json(inventoryItem);
  } catch (error: any) {
    Logger.error('Failed to update inventory item', error, { method: 'PUT', url: `/inventory/${req.params.id}` });
    res.status(400).json({ error: error.message });
  }
});

inventoryRouter.patch('/:id/stock', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const stockData: StockUpdateDTO = req.body;
    const inventoryItem = await inventoryService.updateStock(id, stockData);
    if (!inventoryItem) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    res.json({
      id: inventoryItem.id,
      current_stock: inventoryItem.current_stock,
      status: inventoryItem.status,
      last_updated: inventoryItem.last_updated,
      updated_at: inventoryItem.updated_at,
    });
  } catch (error: any) {
    Logger.error('Failed to update stock', error, { method: 'PATCH', url: `/inventory/${req.params.id}/stock` });
    res.status(400).json({ error: error.message });
  }
});

inventoryRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await inventoryService.deleteInventoryItem(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Inventory item not found' });
    }
    res.json({ message: 'Inventory item deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete inventory item', error, { method: 'DELETE', url: `/inventory/${req.params.id}` });
    res.status(500).json({ error: error.message });
  }
});

inventoryRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await inventoryService.deleteInventoryItems(ids);
    res.json({ message: 'Inventory items deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to delete inventory items', error, { method: 'DELETE', url: '/inventory' });
    res.status(500).json({ error: error.message });
  }
});
