import { Client, CreateClientDTO, ClientSearchParams, ClientListResponse } from '../models/client';
import { getClientRepository } from '../repositories';
import { validateClient, normalizeClientData } from '../utils/client-validation';
import { Logger } from '../utils/logger';
import * as XLSX from 'xlsx';

export class ClientService {
  private repository = getClientRepository();

  async createClient(data: CreateClientDTO): Promise<Client> {
    const normalized = normalizeClientData(data);
    const validation = validateClient(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Check for duplicates (all fields must match)
    const duplicate = await this.repository.findDuplicate(normalized);
    if (duplicate) {
      throw new Error('Duplicate client found. All fields must be unique.');
    }

    return this.repository.create(normalized);
  }

  async getClientById(id: number): Promise<Client | null> {
    return this.repository.findById(id);
  }

  async listClients(params: ClientSearchParams): Promise<ClientListResponse> {
    return this.repository.findAll(params);
  }

  async updateClient(id: number, data: Partial<CreateClientDTO>): Promise<Client | null> {
    // If updating, check for duplicates excluding current record
    if (data.full_name || data.full_address || data.email || data.contact_number) {
      const existing = await this.repository.findById(id);
      if (!existing) {
        return null;
      }

      const updatedData = { ...existing, ...data };
      const normalized = normalizeClientData(updatedData as CreateClientDTO);
      const duplicate = await this.repository.findDuplicate(normalized);
      
      if (duplicate && duplicate.id !== id) {
        throw new Error('Duplicate client found. All fields must be unique.');
      }
    }

    return this.repository.update(id, data);
  }

  async deleteClient(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteClients(ids: number[]): Promise<number> {
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

      // Look for a sheet named "Client" (case-insensitive)
      // If not found, fall back to the first sheet
      let sheetName = workbook.SheetNames.find(name => 
        name.toLowerCase().trim() === 'client'
      );
      
      if (!sheetName) {
        // Fall back to first sheet if "Client" sheet not found
        sheetName = workbook.SheetNames[0];
        Logger.info('Client sheet not found, using first sheet', {
          availableSheets: workbook.SheetNames,
          selectedSheet: sheetName
        });
      } else {
        Logger.info('Found Client sheet', {
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
      const hasRequiredFields = getColumnValue(row, [
        'full_name', 'Full_Name', 'Full Name', 'full name', 'Name', 'name',
        'FULL NAME', 'FullName', 'Client Name', 'client name'
      ]) && getColumnValue(row, [
        'full_address', 'Full_Address', 'Full Address', 'full address', 'Address', 'address',
        'FULL ADDRESS', 'FullAddress', 'Client Address', 'client address'
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
              name: getColumnValue(row, ['full_name', 'Full_Name', 'Full Name', 'full name', 'Name', 'name', 'FULL NAME', 'FullName', 'Client Name', 'client name']),
              address: getColumnValue(row, ['full_address', 'Full_Address', 'Full Address', 'full address', 'Address', 'address', 'FULL ADDRESS', 'FullAddress', 'Client Address', 'client address'])
            }
          });
        }
        continue;
      }

      try {
        // Try multiple column name variations (case-insensitive matching)
        const clientData: CreateClientDTO = {
          full_name: getColumnValue(row, [
            'full_name', 'Full_Name', 'Full Name', 'full name', 'Name', 'name',
            'FULL NAME', 'FullName', 'Client Name', 'client name', 'Client_Name'
          ]) || '',
          full_address: getColumnValue(row, [
            'full_address', 'Full_Address', 'Full Address', 'full address', 'Address', 'address',
            'FULL ADDRESS', 'FullAddress', 'Client Address', 'client address', 'Client_Address'
          ]) || '',
          email: getColumnValue(row, [
            'email', 'Email', 'EMAIL', 'Email Address', 'email address',
            'E-mail', 'e-mail', 'Contact Email', 'contact email'
          ]),
          contact_number: getColumnValue(row, [
            'contact_number', 'Contact_Number', 'Contact Number', 'contact number',
            'Phone', 'phone', 'Phone Number', 'phone number', 'Tel', 'tel',
            'Telephone', 'telephone'
          ]),
        };

        // Validate required fields
        if (!clientData.full_name || !clientData.full_address) {
          const errorMsg = `Row ${i + 2}: Missing required fields (full_name, full_address)`;
          errors.push(errorMsg);
          if (!isEmptyRow(row)) {
            Logger.warn(`Row ${i + 2} validation failed - missing required fields`, {
              row: i + 2,
              error: errorMsg,
              availableColumns: Object.keys(row),
              rowData: row,
              extractedData: clientData,
            });
          }
          continue;
        }

        const normalized = normalizeClientData(clientData);
        const validation = validateClient(normalized);
        
        if (!validation.valid) {
          const errorMsg = `Row ${i + 2}: ${validation.errors.join(', ')}`;
          errors.push(errorMsg);
          Logger.warn(`Row ${i + 2} validation failed - ${validation.errors.join(', ')}`, {
            row: i + 2,
            errors: validation.errors,
            rowData: row,
            extractedData: clientData,
          });
          continue;
        }

        // Check for duplicates
        const duplicate = await this.repository.findDuplicate(normalized);
        if (duplicate) {
          const errorMsg = `Row ${i + 2}: Duplicate client found (all fields match existing record)`;
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
    const clients = response.clients;

    // Prepare data for Excel
    const excelData = clients.map(client => ({
      'Full Name': client.full_name,
      'Full Address': client.full_address,
      'Email': client.email || '',
      'Contact Number': client.contact_number || '',
      'Created At': client.created_at ? new Date(client.created_at).toISOString() : '',
      'Updated At': client.updated_at ? new Date(client.updated_at).toISOString() : '',
    }));

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
  }
}
