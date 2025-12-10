import { CreateClientDTO } from '../models/client';
import { validateEmail } from './validation';

export function validateClient(data: CreateClientDTO): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.full_name || data.full_name.trim().length === 0) {
    errors.push('full_name is required');
  }

  if (!data.full_address || data.full_address.trim().length === 0) {
    errors.push('full_address is required');
  }

  // Email is optional - normalization will set invalid emails to undefined
  if (data.email) {
    const cleanedEmail = data.email.trim().toLowerCase();
    if (cleanedEmail && !validateEmail(cleanedEmail)) {
      // Since email is optional, we'll let normalization handle invalid emails
      // by setting them to undefined, rather than failing validation
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeClientData(data: CreateClientDTO): CreateClientDTO {
  const normalized: CreateClientDTO = {
    full_name: (data.full_name || '').trim(),
    full_address: (data.full_address || '').trim(),
  };

  if (data.email) {
    const cleaned = data.email.trim().toLowerCase();
    // Only set email if it's valid, otherwise set to undefined
    normalized.email = cleaned && validateEmail(cleaned) ? cleaned : undefined;
  }

  if (data.contact_number) {
    normalized.contact_number = data.contact_number.trim() || undefined;
  }

  return normalized;
}
