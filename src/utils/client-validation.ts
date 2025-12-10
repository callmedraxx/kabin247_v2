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

  if (!data.email || data.email.trim().length === 0) {
    errors.push('email is required');
  } else {
    const cleanedEmail = data.email.trim().toLowerCase();
    if (!validateEmail(cleanedEmail)) {
      errors.push('email is invalid');
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
    email: '',
  };

  const cleanedEmail = (data.email || '').trim().toLowerCase();
  normalized.email = cleanedEmail;

  if (data.contact_number) {
    normalized.contact_number = data.contact_number.trim() || undefined;
  }

  return normalized;
}
