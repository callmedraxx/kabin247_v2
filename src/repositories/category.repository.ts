import { Category, CategorySearchParams, CategoryListResponse, CreateCategoryDTO, UpdateCategoryDTO } from '../models/category';

export interface CategoryRepository {
  create(category: CreateCategoryDTO): Promise<Category>;
  findById(id: number): Promise<Category | null>;
  findBySlug(slug: string): Promise<Category | null>;
  findAll(params: CategorySearchParams): Promise<CategoryListResponse>;
  update(id: number, category: UpdateCategoryDTO): Promise<Category | null>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: number[]): Promise<number>;
  count(): Promise<number>;
  updateItemCount(categoryId: number): Promise<void>;
}
