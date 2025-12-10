import { CreateMenuItemDTO, UpdateMenuItemDTO } from '../models/menu-item';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateMenuItem(menuItem: CreateMenuItemDTO | UpdateMenuItemDTO): ValidationResult {
  const errors: string[] = [];

  if ('item_name' in menuItem && !menuItem.item_name) {
    errors.push('item_name is required');
  }

  if ('food_type' in menuItem && menuItem.food_type) {
    const validTypes = ['veg', 'non_veg'];
    if (!validTypes.includes(menuItem.food_type)) {
      errors.push(`food_type must be one of: ${validTypes.join(', ')}`);
    }
  }

  if ('variants' in menuItem && menuItem.variants !== undefined) {
    if (!Array.isArray(menuItem.variants)) {
      errors.push('variants must be an array');
    } else if (menuItem.variants.length > 0) {
      menuItem.variants.forEach((variant, index) => {
        if (!variant.portion_size) {
          errors.push(`variants[${index}].portion_size is required`);
        }
        if (variant.price === undefined || variant.price === null) {
          errors.push(`variants[${index}].price is required`);
        } else if (typeof variant.price !== 'number' || variant.price <= 0) {
          errors.push(`variants[${index}].price must be a positive number`);
        }
      });
    }
  }

  if ('tax_rate' in menuItem && menuItem.tax_rate !== undefined) {
    if (typeof menuItem.tax_rate !== 'number' || menuItem.tax_rate < 0 || menuItem.tax_rate > 100) {
      errors.push('tax_rate must be a number between 0 and 100');
    }
  }

  if ('service_charge' in menuItem && menuItem.service_charge !== undefined) {
    if (typeof menuItem.service_charge !== 'number' || menuItem.service_charge < 0) {
      errors.push('service_charge must be a non-negative number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeMenuItemData<T extends CreateMenuItemDTO | UpdateMenuItemDTO>(menuItem: T): T {
  const normalized = { ...menuItem } as T;

  if ('item_name' in normalized && normalized.item_name) {
    normalized.item_name = normalized.item_name.trim();
  }

  return normalized;
}
