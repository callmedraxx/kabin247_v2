import { Airport, CreateAirportDTO, AirportSearchParams, AirportListResponse } from '../models/airport';
import { getAirportRepository } from '../repositories';
import { validateAirport, normalizeAirportData } from '../utils/validation';
import { Logger } from '../utils/logger';
import * as XLSX from 'xlsx';

export class AirportService {
  private repository = getAirportRepository();

  async createAirport(data: CreateAirportDTO): Promise<Airport> {
    const normalized = normalizeAirportData(data);
    const validation = validateAirport(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    return this.repository.create(normalized);
  }

  async getAirportById(id: number): Promise<Airport | null> {
    return this.repository.findById(id);
  }

  async listAirports(params: AirportSearchParams): Promise<AirportListResponse> {
    return this.repository.findAll(params);
  }

  async deleteAirport(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteAirports(ids: number[]): Promise<number> {
    return this.repository.deleteMany(ids);
  }

  async importFromExcel(fileBuffer: Buffer): Promise<{ success: number; errors: string[] }> {
    let workbook;
    let data: any[] = [];

    try {
      Logger.debug('Reading Excel file', { fileSize: fileBuffer.length });
      workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      
      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('Excel file has no sheets');
      }

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found or is empty`);
      }

      data = XLSX.utils.sheet_to_json(worksheet) as any[];
      
      // Log actual column names found in the file
      const firstRow = data[0] || {};
      const columnNames = Object.keys(firstRow);
      Logger.info('Excel file parsed', { 
        sheetName, 
        totalRows: data.length,
        columns: columnNames,
        sampleRow: firstRow,
        // Show first few rows to understand data structure
        firstFewRows: data.slice(0, 3).map((row, idx) => ({
          rowNumber: idx + 2,
          data: row
        }))
      });
    } catch (error: any) {
      Logger.error('Failed to read Excel file', error, {
        fileSize: fileBuffer.length,
        errorMessage: error.message,
      });
      throw new Error(`Failed to read Excel file: ${error.message}`);
    }

    const errors: string[] = [];
    let success = 0;

    Logger.info('Processing Excel rows', { totalRows: data.length });

    // Helper function to check if a row is completely empty
    const isEmptyRow = (row: any): boolean => {
      return !row || Object.values(row).every(val => 
        val === null || val === undefined || val === '' || 
        (typeof val === 'string' && val.trim() === '')
      );
    };

    // Helper function to find column value with multiple name variations (case-insensitive)
    const getColumnValue = (row: any, possibleNames: string[]): string | undefined => {
      if (!row) return undefined;
      
      // First try exact matches
      for (const name of possibleNames) {
        if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
          const value = String(row[name]).trim();
          if (value) return value;
        }
      }
      
      // Then try case-insensitive matches
      const rowKeys = Object.keys(row);
      for (const possibleName of possibleNames) {
        const lowerPossible = possibleName.toLowerCase().trim();
        for (const key of rowKeys) {
          if (key.toLowerCase().trim() === lowerPossible) {
            const value = row[key];
            if (value !== undefined && value !== null && value !== '') {
              const trimmedValue = String(value).trim();
              if (trimmedValue) return trimmedValue;
            }
          }
        }
      }
      
      return undefined;
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Skip completely empty rows
      if (isEmptyRow(row)) {
        continue;
      }

      try {
        // Match exact export header names first, then fallback to variations
        const airportData: CreateAirportDTO = {
          airport_name: getColumnValue(row, [
            'Airport Name', 'airport_name', 'Airport_Name', 'airport name', 'Airport', 'airport',
            'AIRPORT NAME', 'AirportName',
            'Airport/Facility Name', 'Facility Name', 'facility name'
          ]) || '',
          airport_code_iata: getColumnValue(row, [
            'IATA Code', 'airport_code_iata', 'Airport_Code_IATA', 'IATA', 'iata', 'iata code',
            'Airport Code IATA', 'IATA_CODE', 'IataCode',
            'IATA Airport Code', 'iata airport code'
          ]),
          airport_code_icao: getColumnValue(row, [
            'ICAO Code', 'airport_code_icao', 'Airport_Code_ICAO', 'ICAO', 'icao', 'icao code',
            'Airport Code ICAO', 'ICAO_CODE', 'IcaoCode',
            'ICAO Airport Code', 'icao airport code'
          ]),
        };
        
        // Log first few rows to debug column mapping
        if (i < 3) {
          Logger.debug(`Row ${i + 2} column mapping`, {
            rowNumber: i + 2,
            availableColumns: Object.keys(row),
            extractedData: airportData,
            rawRow: row
          });
        }

        // Validate required fields
        if (!airportData.airport_name) {
          const errorMsg = `Row ${i + 2}: Missing required field (airport_name)`;
          errors.push(errorMsg);
          // Only log if row has some data (not completely empty)
          if (!isEmptyRow(row)) {
            Logger.warn(`Row ${i + 2} validation failed - missing required fields`, {
              row: i + 2,
              error: errorMsg,
              availableColumns: Object.keys(row),
              rowData: row,
              extractedData: airportData,
            });
          }
          continue;
        }

        // Fix swapped IATA/ICAO codes if they're in the wrong columns
        // If IATA column has 4 characters, it's probably ICAO, and vice versa
        let iataCode = airportData.airport_code_iata;
        let icaoCode = airportData.airport_code_icao;
        
        if (iataCode && icaoCode) {
          const iataCleaned = iataCode.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
          const icaoCleaned = icaoCode.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
          
          // If IATA column has 4 chars and ICAO has 3 chars, they're swapped
          if (iataCleaned.length === 4 && icaoCleaned.length === 3) {
            // Swap them
            airportData.airport_code_iata = icaoCode;
            airportData.airport_code_icao = iataCode;
            Logger.debug(`Row ${i + 2}: Swapped IATA/ICAO codes`, {
              rowNumber: i + 2,
              originalIATA: iataCode,
              originalICAO: icaoCode,
              swappedIATA: icaoCode,
              swappedICAO: iataCode
            });
          }
        }
        
        // Normalize first to clean up the data, then validate
        const normalized = normalizeAirportData(airportData);
        // Validate the normalized data
        const validation = validateAirport(normalized);
        
        if (!validation.valid) {
          const errorMsg = `Row ${i + 2}: ${validation.errors.join(', ')}`;
          errors.push(errorMsg);
          Logger.warn(`Row ${i + 2} validation failed - ${validation.errors.join(', ')}`, {
            row: i + 2,
            errors: validation.errors,
            rowData: row,
            extractedData: airportData,
          });
          continue;
        }

        await this.repository.create(normalized);
        success++;
      } catch (error: any) {
        const errorMsg = `Row ${i + 2}: ${error.message || 'Unknown error'}`;
        errors.push(errorMsg);
        Logger.error('Failed to import row', error, {
          row: i + 2,
          rowData: row,
          errorMessage: error.message,
          errorStack: error.stack,
        });
      }
    }

    if (errors.length > 0) {
      Logger.warn('Import completed with errors', {
        success,
        errorsCount: errors.length,
        totalRows: data.length,
        errorSummary: errors.slice(0, 5), // Log first 5 errors
      });
    }

    return { success, errors };
  }

  async exportToExcel(): Promise<Buffer> {
    const response = await this.repository.findAll({ limit: 10000 });
    const airports = response.airports;

    // Prepare data for Excel
    const excelData = airports.map(airport => ({
      'Airport Name': airport.airport_name,
      'IATA Code': airport.airport_code_iata || '',
      'ICAO Code': airport.airport_code_icao || '',
      'Created At': airport.created_at ? new Date(airport.created_at).toISOString() : '',
      'Updated At': airport.updated_at ? new Date(airport.updated_at).toISOString() : '',
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Airports');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }
}

