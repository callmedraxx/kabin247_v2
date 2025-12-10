import { MenuItem, CreateMenuItemDTO, UpdateMenuItemDTO, MenuItemSearchParams, MenuItemListResponse, MenuItemStatusUpdateDTO } from '../models/menu-item';
import { getMenuItemRepository, getCategoryRepository } from '../repositories';
import { validateMenuItem, normalizeMenuItemData } from '../utils/menu-item-validation';
import { Logger } from '../utils/logger';

export class MenuItemService {
  private repository = getMenuItemRepository();
  private categoryRepository = getCategoryRepository();

  private async validateCategory(categoryIdOrSlug: string): Promise<void> {
    // Check if category exists (by ID or slug)
    const isNumeric = /^\d+$/.test(categoryIdOrSlug);
    const category = isNumeric 
      ? await this.categoryRepository.findById(parseInt(categoryIdOrSlug))
      : await this.categoryRepository.findBySlug(categoryIdOrSlug);
    
    if (!category) {
      throw new Error(`Category not found: ${categoryIdOrSlug}`);
    }
  }

  async createMenuItem(data: CreateMenuItemDTO): Promise<MenuItem> {
    const normalized = normalizeMenuItemData(data);
    const validation = validateMenuItem(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Validate category exists if provided
    if (normalized.category) {
      await this.validateCategory(normalized.category);
    }

    return this.repository.create(normalized);
  }

  async getMenuItemById(id: number): Promise<MenuItem | null> {
    return this.repository.findById(id);
  }

  async listMenuItems(params: MenuItemSearchParams): Promise<MenuItemListResponse> {
    return this.repository.findAll(params);
  }

  async updateMenuItem(id: number, data: UpdateMenuItemDTO): Promise<MenuItem | null> {
    const normalized = normalizeMenuItemData(data);
    
    if (Object.keys(normalized).length > 0) {
      const validation = validateMenuItem(normalized);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
    }

    // Validate category if provided
    if (normalized.category) {
      await this.validateCategory(normalized.category);
    }

    return this.repository.update(id, normalized);
  }

  async updateMenuItemStatus(id: number, statusData: MenuItemStatusUpdateDTO): Promise<MenuItem | null> {
    return this.repository.update(id, { is_active: statusData.is_active });
  }

  async deleteMenuItem(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteMenuItems(ids: number[]): Promise<number> {
    return this.repository.deleteMany(ids);
  }
}
