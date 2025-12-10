import { CreateCategoryDTO, UpdateCategoryDTO } from '../models/category';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCategory(category: CreateCategoryDTO | UpdateCategoryDTO): ValidationResult {
  const errors: string[] = [];

  if ('name' in category && !category.name) {
    errors.push('name is required');
  }

  if ('slug' in category && category.slug) {
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(category.slug)) {
      errors.push('slug must contain only lowercase letters, numbers, and hyphens');
    }
  }

  if ('display_order' in category && category.display_order !== undefined) {
    if (typeof category.display_order !== 'number' || category.display_order < 0) {
      errors.push('display_order must be a non-negative integer');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeCategoryData<T extends CreateCategoryDTO | UpdateCategoryDTO>(category: T): T {
  const normalized = { ...category } as T;

  if ('name' in normalized && normalized.name) {
    normalized.name = normalized.name.trim();
  }

  if ('slug' in normalized && normalized.slug) {
    normalized.slug = normalized.slug.toLowerCase().trim();
  }

  return normalized;
}
