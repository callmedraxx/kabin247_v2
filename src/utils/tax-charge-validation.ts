import { CreateTaxChargeDTO, UpdateTaxChargeDTO } from '../models/tax-charge';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateTaxCharge(taxCharge: CreateTaxChargeDTO | UpdateTaxChargeDTO): ValidationResult {
  const errors: string[] = [];

  if ('name' in taxCharge && !taxCharge.name) {
    errors.push('name is required');
  }

  if ('type' in taxCharge && taxCharge.type) {
    const validTypes = ['tax', 'service_charge', 'delivery_fee', 'other'];
    if (!validTypes.includes(taxCharge.type)) {
      errors.push(`type must be one of: ${validTypes.join(', ')}`);
    }
  }

  if ('rate' in taxCharge && taxCharge.rate !== undefined) {
    if (typeof taxCharge.rate !== 'number' || taxCharge.rate < 0) {
      errors.push('rate must be a non-negative number');
    }
  }

  if ('is_percentage' in taxCharge && taxCharge.is_percentage !== undefined) {
    if (typeof taxCharge.is_percentage !== 'boolean') {
      errors.push('is_percentage must be a boolean');
    } else if (taxCharge.is_percentage && 'rate' in taxCharge && taxCharge.rate !== undefined) {
      if (taxCharge.rate > 100) {
        errors.push('rate cannot exceed 100 when is_percentage is true');
      }
    }
  }

  if ('applies_to' in taxCharge && taxCharge.applies_to) {
    const validAppliesTo = ['all', 'category', 'location', 'item'];
    if (!validAppliesTo.includes(taxCharge.applies_to)) {
      errors.push(`applies_to must be one of: ${validAppliesTo.join(', ')}`);
    }

    if (taxCharge.applies_to === 'category' && !taxCharge.category) {
      errors.push('category is required when applies_to is "category"');
    }

    if (taxCharge.applies_to === 'location' && !taxCharge.location) {
      errors.push('location is required when applies_to is "location"');
    }
  }

  if ('min_amount' in taxCharge && taxCharge.min_amount !== undefined) {
    if (typeof taxCharge.min_amount !== 'number' || taxCharge.min_amount < 0) {
      errors.push('min_amount must be a non-negative number');
    }
  }

  if ('max_amount' in taxCharge && taxCharge.max_amount !== undefined) {
    if (typeof taxCharge.max_amount !== 'number' || taxCharge.max_amount < 0) {
      errors.push('max_amount must be a non-negative number');
    }
  }

  if ('min_amount' in taxCharge && 'max_amount' in taxCharge && 
      taxCharge.min_amount !== undefined && taxCharge.max_amount !== undefined) {
    if (taxCharge.min_amount > taxCharge.max_amount) {
      errors.push('min_amount cannot be greater than max_amount');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeTaxChargeData(taxCharge: CreateTaxChargeDTO | UpdateTaxChargeDTO): CreateTaxChargeDTO | UpdateTaxChargeDTO {
  const normalized = { ...taxCharge };

  if ('name' in normalized && normalized.name) {
    normalized.name = normalized.name.trim();
  }

  if ('location' in normalized && normalized.location) {
    normalized.location = normalized.location.trim();
  }

  return normalized;
}
