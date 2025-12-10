import { CreateAddonItemDTO, UpdateAddonItemDTO } from '../models/addon-item';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateAddonItem(addonItem: CreateAddonItemDTO | UpdateAddonItemDTO): ValidationResult {
  const errors: string[] = [];

  if ('name' in addonItem && !addonItem.name) {
    errors.push('name is required');
  }

  if ('price' in addonItem && addonItem.price !== undefined) {
    if (typeof addonItem.price !== 'number' || addonItem.price <= 0) {
      errors.push('price must be a positive number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeAddonItemData(addonItem: CreateAddonItemDTO | UpdateAddonItemDTO): CreateAddonItemDTO | UpdateAddonItemDTO {
  const normalized = { ...addonItem };

  if ('name' in normalized && normalized.name) {
    normalized.name = normalized.name.trim();
  }

  return normalized;
}
