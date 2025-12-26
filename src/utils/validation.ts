import { CreateAirportDTO } from '../models/airport';

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateIATACode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

export function validateICAOCode(code: string): boolean {
  return /^[A-Z]{4}$/.test(code);
}

export function validateAirport(data: CreateAirportDTO): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.airport_name || data.airport_name.trim().length === 0) {
    errors.push('airport_name is required');
  }

  // IATA and ICAO codes are optional - normalization will set invalid codes to undefined
  // We only validate codes that are present after normalization (meaning they passed cleaning)
  // If a code can't be cleaned to valid format, normalization sets it to undefined (no validation error)
  if (data.airport_code_iata) {
    const cleaned = data.airport_code_iata.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
    // Only validate if after cleaning we have exactly 3 letters (valid format)
    // Invalid codes will be set to undefined by normalization, so no error needed
    if (cleaned && cleaned.length === 3 && !validateIATACode(cleaned)) {
      errors.push('airport_code_iata must be exactly 3 uppercase letters');
    }
    // Codes with wrong length (not 3) will be normalized to undefined (acceptable for optional field)
  }

  if (data.airport_code_icao) {
    const cleaned = data.airport_code_icao.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
    // Only validate if after cleaning we have exactly 4 letters (valid format)
    // Invalid codes will be set to undefined by normalization, so no error needed
    if (cleaned && cleaned.length === 4 && !validateICAOCode(cleaned)) {
      errors.push('airport_code_icao must be exactly 4 uppercase letters');
    }
    // Codes with wrong length (not 4) will be normalized to undefined (acceptable for optional field)
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeAirportData(data: CreateAirportDTO): CreateAirportDTO {
  const normalized: CreateAirportDTO = {
    airport_name: data.airport_name.trim(),
  };

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

  return normalized;
}

