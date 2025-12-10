import { Router, Request, Response } from 'express';
import { CategoryService } from '../services/category.service';
import { CreateCategoryDTO, UpdateCategoryDTO, CategorySearchParams } from '../models/category';
import { Logger } from '../utils/logger';

export const categoryRouter = Router();
const categoryService = new CategoryService();

/**
 * @swagger
 * /categories:
 *   post:
 *     summary: Create a new category
 *     tags: [Categories]
 */
categoryRouter.post('/', async (req: Request, res: Response) => {
  try {
    const categoryData: CreateCategoryDTO = req.body;
    const category = await categoryService.createCategory(categoryData);
    res.status(201).json(category);
  } catch (error: any) {
    Logger.error('Failed to create category', error, {
      method: 'POST',
      url: '/categories',
      body: req.body,
    });
    res.status(400).json({ error: error.message });
  }
});

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: List categories
 *     tags: [Categories]
 */
categoryRouter.get('/', async (req: Request, res: Response) => {
  try {
    const params: CategorySearchParams = {
      search: req.query.search as string,
      is_active: req.query.is_active === 'true' ? true : req.query.is_active === 'false' ? false : undefined,
      sortBy: req.query.sortBy as string,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    const result = await categoryService.listCategories(params);
    res.json(result);
  } catch (error: any) {
    Logger.error('Failed to list categories', error, {
      method: 'GET',
      url: '/categories',
    });
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /categories/{id}:
 *   get:
 *     summary: Get category by ID or slug
 *     tags: [Categories]
 */
categoryRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const idOrSlug = req.params.id;
    const isNumeric = /^\d+$/.test(idOrSlug);
    
    const category = isNumeric
      ? await categoryService.getCategoryById(parseInt(idOrSlug))
      : await categoryService.getCategoryBySlug(idOrSlug);
    
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error: any) {
    Logger.error('Failed to get category', error, {
      method: 'GET',
      url: `/categories/${req.params.id}`,
    });
    res.status(500).json({ error: error.message });
  }
});

categoryRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const categoryData: UpdateCategoryDTO = req.body;
    const category = await categoryService.updateCategory(id, categoryData);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error: any) {
    Logger.error('Failed to update category', error, {
      method: 'PUT',
      url: `/categories/${req.params.id}`,
    });
    res.status(400).json({ error: error.message });
  }
});

categoryRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = await categoryService.deleteCategory(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({ message: 'Category deleted successfully' });
  } catch (error: any) {
    Logger.error('Failed to delete category', error, {
      method: 'DELETE',
      url: `/categories/${req.params.id}`,
    });
    res.status(400).json({ error: error.message });
  }
});

categoryRouter.delete('/', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required and must not be empty' });
    }
    const deleted = await categoryService.deleteCategories(ids);
    res.json({ message: 'Categories deleted successfully', deleted });
  } catch (error: any) {
    Logger.error('Failed to delete categories', error, {
      method: 'DELETE',
      url: '/categories',
    });
    res.status(400).json({ error: error.message });
  }
});
