import { Caterer, CreateCatererDTO, CatererSearchParams, CatererListResponse } from '../models/caterer';
import { getCatererRepository } from '../repositories';
import { validateCaterer, normalizeCatererData } from '../utils/caterer-validation';
import { Logger } from '../utils/logger';
import * as XLSX from 'xlsx';

export class CatererService {
  private repository = getCatererRepository();

  async createCaterer(data: CreateCatererDTO): Promise<Caterer> {
    const normalized = normalizeCatererData(data);
    const validation = validateCaterer(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Check for duplicates (all fields must match)
    const duplicate = await this.repository.findDuplicate(normalized);
    if (duplicate) {
      throw new Error('Duplicate caterer found. All fields must be unique.');
    }

    return this.repository.create(normalized);
  }

  async getCatererById(id: number): Promise<Caterer | null> {
    return this.repository.findById(id);
  }

  async listCaterers(params: CatererSearchParams): Promise<CatererListResponse> {
    return this.repository.findAll(params);
  }

  async updateCaterer(id: number, data: Partial<CreateCatererDTO>): Promise<Caterer | null> {
    // If updating, check for duplicates excluding current record
    if (data.caterer_name || data.caterer_number || data.caterer_email || 
        data.airport_code_iata || data.airport_code_icao || data.time_zone) {
      const existing = await this.repository.findById(id);
      if (!existing) {
        return null;
      }

      const updatedData = { ...existing, ...data };
      const normalized = normalizeCatererData(updatedData as CreateCatererDTO);
      const duplicate = await this.repository.findDuplicate(normalized);
      
      if (duplicate && duplicate.id !== id) {
        throw new Error('Duplicate caterer found. All fields must be unique.');
      }
    }

    return this.repository.update(id, data);
  }

  async deleteCaterer(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteCaterers(ids: number[]): Promise<number> {
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

      // Look for a sheet named "Caterer" (case-insensitive)
      // If not found, fall back to the first sheet
      let sheetName = workbook.SheetNames.find(name => 
        name.toLowerCase().trim() === 'caterer'
      );
      
      if (!sheetName) {
        // Fall back to first sheet if "Caterer" sheet not found
        sheetName = workbook.SheetNames[0];
        Logger.info('Caterer sheet not found, using first sheet', {
          availableSheets: workbook.SheetNames,
          selectedSheet: sheetName
        });
      } else {
        Logger.info('Found Caterer sheet', {
          availableSheets: workbook.SheetNames,
          selectedSheet: sheetName
        });
      }

      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        throw new Error(`Sheet "${sheetName}" not found or is empty`);
      }

      data = XLSX.utils.sheet_to_json(worksheet) as any[];
      Logger.debug('Excel file parsed', { 
        sheetName, 
        totalRows: data.length,
        columns: Object.keys(data[0] || {}),
        firstRowSample: data[0] || null,
        firstFewRows: data.slice(0, 3)
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

    // Helper function to check if a row is completely empty
    const isEmptyRow = (row: any): boolean => {
      if (!row) return true;
      
      // Check if all values are empty
      const allValuesEmpty = Object.values(row).every(val => 
        val === null || val === undefined || val === '' || 
        (typeof val === 'string' && val.trim() === '')
      );
      
      if (allValuesEmpty) return true;
      
      // Also treat rows as empty if they don't have required fields
      // This prevents generating hundreds of error messages for rows with only optional fields
      const hasRequiredFields = getColumnValue(row, [
        'Caterer Name', 'caterer_name', 'Caterer_Name', 'caterer name', 'Caterer', 'caterer',
        'CATERER NAME', 'CatererName', 'Name'
      ]) && getColumnValue(row, [
        'Caterer Number', 'caterer_number', 'Caterer_Number', 'caterer number', 'Number', 'number',
        'CATERER NUMBER', 'CatererNumber', 'Phone Number', 'phone number'
      ]);
      
      return !hasRequiredFields;
    };

    // Log first few rows for debugging
    if (data.length > 0) {
      Logger.debug('Sample rows from Excel', {
        firstRow: data[0],
        secondRow: data[1] || null,
        thirdRow: data[2] || null,
        allColumnNames: data.length > 0 ? Object.keys(data[0]) : []
      });
    }

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      // Skip completely empty rows
      if (isEmptyRow(row)) {
        // Log first few skipped rows for debugging
        if (i < 5) {
          Logger.debug(`Row ${i + 2} skipped as empty`, {
            rowIndex: i + 2,
            rowData: row,
            hasRequiredFields: {
              name: getColumnValue(row, ['caterer_name', 'Caterer_Name', 'Caterer Name', 'caterer name', 'Caterer', 'caterer', 'CATERER NAME', 'CatererName', 'Name']),
              number: getColumnValue(row, ['caterer_number', 'Caterer_Number', 'Caterer Number', 'caterer number', 'Number', 'number', 'CATERER NUMBER', 'CatererNumber', 'Phone Number', 'phone number'])
            }
          });
        }
        continue;
      }

      try {
        // Match exact export header names first, then fallback to variations
        const catererData: CreateCatererDTO = {
          caterer_name: getColumnValue(row, [
            'Caterer Name', 'caterer_name', 'Caterer_Name', 'caterer name', 'Caterer', 'caterer',
            'CATERER NAME', 'CatererName', 'Name'
          ]) || '',
          caterer_number: getColumnValue(row, [
            'Caterer Number', 'caterer_number', 'Caterer_Number', 'caterer number', 'Number', 'number',
            'CATERER NUMBER', 'CatererNumber', 'Phone Number', 'phone number'
          ]) || '',
          caterer_email: getColumnValue(row, [
            'Caterer Email', 'caterer_email', 'Caterer_Email', 'caterer email', 'Email', 'email',
            'CATERER EMAIL', 'CatererEmail', 'Contact Email', 'Email Address'
          ]),
          airport_code_iata: getColumnValue(row, [
            'IATA Code', 'airport_code_iata', 'Airport_Code_IATA', 'IATA', 'iata', 'iata code',
            'Airport Code IATA', 'IATA_CODE', 'IataCode'
          ]),
          airport_code_icao: getColumnValue(row, [
            'ICAO Code', 'airport_code_icao', 'Airport_Code_ICAO', 'ICAO', 'icao', 'icao code',
            'Airport Code ICAO', 'ICAO_CODE', 'IcaoCode'
          ]),
          time_zone: getColumnValue(row, [
            'Time Zone', 'time_zone', 'Time_Zone', 'time zone', 'Timezone', 'timezone',
            'TIME ZONE', 'TimeZone', 'TZ', 'tz'
          ]),
        };

        // Fix swapped IATA/ICAO codes if they're in the wrong columns
        let iataCode = catererData.airport_code_iata;
        let icaoCode = catererData.airport_code_icao;
        
        if (iataCode && icaoCode) {
          const iataCleaned = iataCode.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
          const icaoCleaned = icaoCode.replace(/[^A-Za-z]/g, '').toUpperCase().trim();
          
          // If IATA column has 4 chars and ICAO has 3 chars, they're swapped
          if (iataCleaned.length === 4 && icaoCleaned.length === 3) {
            catererData.airport_code_iata = icaoCode;
            catererData.airport_code_icao = iataCode;
          }
        }

        // Validate required fields
        if (!catererData.caterer_name || !catererData.caterer_number) {
          const errorMsg = `Row ${i + 2}: Missing required fields (caterer_name, caterer_number)`;
          errors.push(errorMsg);
          if (!isEmptyRow(row)) {
            Logger.warn(`Row ${i + 2} validation failed - missing required fields`, {
              row: i + 2,
              error: errorMsg,
              availableColumns: Object.keys(row),
              rowData: row,
              extractedData: catererData,
            });
          }
          continue;
        }

        const normalized = normalizeCatererData(catererData);
        const validation = validateCaterer(normalized);
        
        if (!validation.valid) {
          const errorMsg = `Row ${i + 2}: ${validation.errors.join(', ')}`;
          errors.push(errorMsg);
          Logger.warn(`Row ${i + 2} validation failed - ${validation.errors.join(', ')}`, {
            row: i + 2,
            errors: validation.errors,
            rowData: row,
            extractedData: catererData,
          });
          continue;
        }

        // Check for duplicates
        const duplicate = await this.repository.findDuplicate(normalized);
        if (duplicate) {
          const errorMsg = `Row ${i + 2}: Duplicate caterer found (all fields match existing record)`;
          errors.push(errorMsg);
          Logger.warn(`Row ${i + 2} duplicate detected`, {
            row: i + 2,
            rowData: row,
            extractedData: normalized,
            existingId: duplicate.id,
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
        errorSummary: errors.slice(0, 5),
      });
    }

    return { success, errors };
  }

  async exportToExcel(): Promise<Buffer> {
    const response = await this.repository.findAll({ limit: 10000 });
    const caterers = response.caterers;

    // Prepare data for Excel
    const excelData = caterers.map(caterer => ({
      'Caterer Name': caterer.caterer_name,
      'Caterer Number': caterer.caterer_number,
      'Caterer Email': caterer.caterer_email || '',
      'IATA Code': caterer.airport_code_iata || '',
      'ICAO Code': caterer.airport_code_icao || '',
      'Time Zone': caterer.time_zone || '',
      'Created At': caterer.created_at ? new Date(caterer.created_at).toISOString() : '',
      'Updated At': caterer.updated_at ? new Date(caterer.updated_at).toISOString() : '',
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Caterers');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }
}

