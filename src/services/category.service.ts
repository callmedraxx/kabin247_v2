import { Category, CreateCategoryDTO, UpdateCategoryDTO, CategorySearchParams, CategoryListResponse } from '../models/category';
import { getCategoryRepository } from '../repositories';
import { validateCategory, normalizeCategoryData, generateSlug } from '../utils/category-validation';
import { Logger } from '../utils/logger';

export class CategoryService {
  private repository = getCategoryRepository();

  async createCategory(data: CreateCategoryDTO): Promise<Category> {
    const normalized = normalizeCategoryData(data);
    
    // Auto-generate slug if not provided
    if (!normalized.slug) {
      normalized.slug = generateSlug(normalized.name);
    }

    const validation = validateCategory(normalized);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return this.repository.create(normalized);
  }

  async getCategoryById(id: number): Promise<Category | null> {
    return this.repository.findById(id);
  }

  async getCategoryBySlug(slug: string): Promise<Category | null> {
    return this.repository.findBySlug(slug);
  }

  async listCategories(params: CategorySearchParams): Promise<CategoryListResponse> {
    return this.repository.findAll(params);
  }

  async updateCategory(id: number, data: UpdateCategoryDTO): Promise<Category | null> {
    const normalized = normalizeCategoryData(data);
    
    // Auto-generate slug if name changed but slug not provided
    if (normalized.name && !normalized.slug) {
      const existing = await this.repository.findById(id);
      if (existing && normalized.name !== existing.name) {
        normalized.slug = generateSlug(normalized.name);
      }
    }

    const validation = validateCategory(normalized);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return this.repository.update(id, normalized);
  }

  async deleteCategory(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteCategories(ids: number[]): Promise<number> {
    return this.repository.deleteMany(ids);
  }
}
