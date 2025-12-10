import { Category, CategorySearchParams, CategoryListResponse, CreateCategoryDTO, UpdateCategoryDTO } from '../models/category';
import { CategoryRepository } from './category.repository';

export class InMemoryCategoryRepository implements CategoryRepository {
  private categories: Category[] = [];
  private nextId: number = 1;

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  async create(categoryData: CreateCategoryDTO): Promise<Category> {
    const now = new Date();
    const slug = categoryData.slug || this.generateSlug(categoryData.name);
    
    // Check if slug already exists
    const existing = this.categories.find(c => c.slug === slug);
    if (existing) {
      throw new Error(`Category with slug "${slug}" already exists`);
    }

    const newCategory: Category = {
      id: this.nextId++,
      name: categoryData.name,
      slug,
      description: categoryData.description,
      image_url: categoryData.image_url,
      icon: categoryData.icon,
      display_order: categoryData.display_order,
      item_count: 0,
      is_active: categoryData.is_active !== undefined ? categoryData.is_active : true,
      created_at: now,
      updated_at: now,
    };

    this.categories.push(newCategory);
    return newCategory;
  }

  async findById(id: number): Promise<Category | null> {
    return this.categories.find(c => c.id === id) || null;
  }

  async findBySlug(slug: string): Promise<Category | null> {
    return this.categories.find(c => c.slug === slug) || null;
  }

  async findAll(params: CategorySearchParams): Promise<CategoryListResponse> {
    let filtered = [...this.categories];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(category => {
        return (
          category.name?.toLowerCase().includes(searchLower) ||
          category.slug?.toLowerCase().includes(searchLower) ||
          category.description?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply active filter
    if (params.is_active !== undefined) {
      filtered = filtered.filter(category => category.is_active === params.is_active);
    }

    // Apply sorting
    const sortBy = params.sortBy || 'display_order';
    const sortOrder = params.sortOrder || 'asc';
    filtered.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    const total = filtered.length;

    // Apply pagination
    const limit = params.limit || 100;
    const page = params.page || 1;
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      categories: paginated,
      total,
      page,
      limit,
    };
  }

  async update(id: number, categoryData: UpdateCategoryDTO): Promise<Category | null> {
    const index = this.categories.findIndex(c => c.id === id);
    if (index === -1) return null;

    const existing = this.categories[index];
    
    // Handle slug update
    let slug = existing.slug;
    if (categoryData.slug) {
      slug = categoryData.slug;
      // Check if slug already exists (excluding current category)
      const existingSlug = this.categories.find(c => c.slug === slug && c.id !== id);
      if (existingSlug) {
        throw new Error(`Category with slug "${slug}" already exists`);
      }
    } else if (categoryData.name && categoryData.name !== existing.name) {
      // Auto-generate slug if name changed
      slug = this.generateSlug(categoryData.name);
      const existingSlug = this.categories.find(c => c.slug === slug && c.id !== id);
      if (existingSlug) {
        slug = `${slug}-${id}`; // Make unique
      }
    }

    this.categories[index] = {
      ...existing,
      ...categoryData,
      slug,
      updated_at: new Date(),
    };

    return this.categories[index];
  }

  async delete(id: number): Promise<boolean> {
    const index = this.categories.findIndex(c => c.id === id);
    if (index === -1) return false;

    this.categories.splice(index, 1);
    return true;
  }

  async deleteMany(ids: number[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        deleted++;
      }
    }
    return deleted;
  }

  async count(): Promise<number> {
    return this.categories.length;
  }

  async updateItemCount(categoryId: number): Promise<void> {
    const category = this.categories.find(c => c.id === categoryId);
    if (category) {
      // In a real implementation, this would count menu items
      // For now, we'll leave it as is since we don't have menu items yet
      category.item_count = 0;
    }
  }
}
