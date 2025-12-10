import { Router, Request, Response } from 'express';
import { TaxChargeService } from '../services/tax-charge.service';
import { CreateTaxChargeDTO, UpdateTaxChargeDTO, TaxChargeSearchParams } from '../models/tax-charge';
import { Logger } from '../utils/logger';

export const taxChargeRouter = Router();
const taxChargeService = new TaxChargeService();

taxChargeRouter.post('/', async (req: Request, res: Response) => {
  try {
    const taxChargeData: CreateTaxChargeDTO = req.body;
    const taxCharge = await taxChargeService.createTaxCharge(taxChargeData);
    res.status(201).json(taxCharge);
  } catch (error: any) {
    Logger.error('Failed to create tax charge', error, { method: 'POST', url: '/tax-charges', body: req.body });
    res.status(400).json({ error: error.message });
  }
});

taxChargeRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: TaxChargeSearchParams = {
      search: req.query.search as string,
      type: req.query.type as string,
      applies_to: req.query.applies_to as string,
      is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await taxChargeService.listTaxCharges(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list tax charges', error, { method: 'GET', url: '/tax-charges' });
    res.status(500).json({ error: error.message });
  }
});

taxChargeRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const taxCharge = await taxChargeService.getTaxChargeById(id);
    if (!taxCharge) {
      return res.status(404).json({ error: 'Tax charge not found' });
    }
    res.json(taxCharge);
  } catch (error: any) {
    Logger.error('Failed to get tax charge', error, { method: 'GET', url: `/tax-charges/${req.params.id}` });
    res.status(500).json({ error: error.message });
  }
});

taxChargeRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const taxChargeData: UpdateTaxChargeDTO = req.body;
    const taxCharge = await taxChargeService.updateTaxCharge(id, taxChargeData);
    if (!taxCharge) {
      return res.status(404).json({ error: 'Tax charge not found' });
    }
    res.json(taxCharge);
  } catch (error: any) {
    Logger.error('Failed to update tax charge', error, { method: 'PUT', url: `/tax-charges/${req.params.id}` });
    res.status(400).json({ error: error.message });
  }
});

taxChargeRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await taxChargeService.deleteTaxCharge(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Tax charge not found' });
    }
    res.json({ message: 'Tax charge deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete tax charge', error, { method: 'DELETE', url: `/tax-charges/${req.params.id}` });
    res.status(500).json({ error: error.message });
  }
});

taxChargeRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await taxChargeService.deleteTaxCharges(ids);
    res.json({ message: 'Tax charges deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to delete tax charges', error, { method: 'DELETE', url: '/tax-charges' });
    res.status(500).json({ error: error.message });
  }
});
