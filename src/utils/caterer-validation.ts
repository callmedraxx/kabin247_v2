import { CreateCatererDTO } from '../models/caterer';
import { validateEmail, validateIATACode, validateICAOCode } from './validation';

export function validateCaterer(data: CreateCatererDTO): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.caterer_name || data.caterer_name.trim().length === 0) {
    errors.push('caterer_name is required');
  }

  if (!data.caterer_number || data.caterer_number.trim().length === 0) {
    errors.push('caterer_number is required');
  }

  // Email is optional - normalization will set invalid emails to undefined
  if (data.caterer_email) {
    const cleanedEmail = data.caterer_email.trim().toLowerCase();
    if (cleanedEmail && !validateEmail(cleanedEmail)) {
      // Since email is optional, we'll let normalization handle invalid emails
      // by setting them to undefined, rather than failing validation
    }
  }

  // IATA and ICAO codes are optional - normalization will set invalid codes to undefined
  if (data.airport_code_iata) {
    const cleaned = data.airport_code_iata.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
    // Only validate if after cleaning we have exactly 3 letters (valid format)
    if (cleaned && cleaned.length === 3 && !validateIATACode(cleaned)) {
      errors.push('airport_code_iata must be exactly 3 uppercase letters');
    }
  }

  if (data.airport_code_icao) {
    const cleaned = data.airport_code_icao.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
    // Only validate if after cleaning we have exactly 4 letters (valid format)
    if (cleaned && cleaned.length === 4 && !validateICAOCode(cleaned)) {
      errors.push('airport_code_icao must be exactly 4 uppercase letters');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeCatererData(data: CreateCatererDTO): CreateCatererDTO {
  const normalized: CreateCatererDTO = {
    caterer_name: (data.caterer_name || '').trim(),
    caterer_number: (data.caterer_number || '').trim(),
  };

  if (data.caterer_email) {
    const cleaned = data.caterer_email.trim().toLowerCase();
    // Only set email if it's valid, otherwise set to undefined
    normalized.caterer_email = cleaned && validateEmail(cleaned) ? cleaned : undefined;
  }

  if (data.airport_code_iata) {
    // Remove all non-letter characters, then uppercase and trim
    const cleaned = data.airport_code_iata.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
    // Only set if it's exactly 3 letters (valid IATA code), otherwise set to undefined
    normalized.airport_code_iata = cleaned && cleaned.length === 3 ? cleaned : undefined;
  }

  if (data.airport_code_icao) {
    // Remove all non-letter characters, then uppercase and trim
    const cleaned = data.airport_code_icao.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
    // Only set if it's exactly 4 letters (valid ICAO code), otherwise set to undefined
    normalized.airport_code_icao = cleaned && cleaned.length === 4 ? cleaned : undefined;
  }

  if (data.time_zone) {
    normalized.time_zone = data.time_zone.trim() || undefined;
  }

  // Preserve additional_emails array
  if (data.additional_emails && Array.isArray(data.additional_emails)) {
    normalized.additional_emails = data.additional_emails;
  }

  return normalized;
}

