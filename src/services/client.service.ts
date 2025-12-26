import { Client, CreateClientDTO, ClientSearchParams, ClientListResponse } from '../models/client';
import { getClientRepository } from '../repositories';
import { validateClient, normalizeClientData } from '../utils/client-validation';
import { Logger } from '../utils/logger';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

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

      // Look for a sheet named "Client" or "Clients" (case-insensitive)
      // If not found, fall back to the first sheet
      let sheetName = workbook.SheetNames.find(name => {
        const normalized = name.toLowerCase().trim();
        return normalized === 'client' || normalized === 'clients';
      });
      
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
        'Full Name', 'full_name', 'Full_Name', 'full name', 'Name', 'name',
        'FULL NAME', 'FullName', 'Client Name', 'client name'
      ]) && getColumnValue(row, [
        'Full Address', 'full_address', 'Full_Address', 'full address', 'Address', 'address',
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
        // Match exact export header names first, then fallback to variations
        const clientData: CreateClientDTO = {
          full_name: getColumnValue(row, [
            'Full Name', 'full_name', 'Full_Name', 'full name', 'Name', 'name',
            'FULL NAME', 'FullName', 'Client Name', 'client name', 'Client_Name'
          ]) || '',
          company_name: getColumnValue(row, [
            'Company Name', 'company_name', 'Company_Name', 'company name',
            'COMPANY NAME', 'CompanyName', 'Company', 'company'
          ]),
          full_address: getColumnValue(row, [
            'Full Address', 'full_address', 'Full_Address', 'full address', 'Address', 'address',
            'FULL ADDRESS', 'FullAddress', 'Client Address', 'client address', 'Client_Address'
          ]) || '',
          email: getColumnValue(row, [
            'Email', 'email', 'EMAIL', 'Email Address', 'email address',
            'E-mail', 'e-mail', 'Contact Email', 'contact email'
          ]) || '',
          contact_number: getColumnValue(row, [
            'Contact Number', 'contact_number', 'Contact_Number', 'contact number',
            'Phone', 'phone', 'Phone Number', 'phone number', 'Tel', 'tel',
            'Telephone', 'telephone'
          ]),
        };

        // Validate required fields
        if (!clientData.full_name || !clientData.full_address || !clientData.email) {
          const errorMsg = `Row ${i + 2}: Missing required fields (full_name, full_address, email)`;
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

    // Create workbook using ExcelJS for better formatting support
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Clients');

    // Define column headers and widths - narrower columns with wrapping
    const columns = [
      { header: 'Full Name', key: 'fullName', width: 25 },
      { header: 'Company Name', key: 'companyName', width: 25 },
      { header: 'Full Address', key: 'fullAddress', width: 35 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Contact Number', key: 'contactNumber', width: 18 },
    ];

    worksheet.columns = columns;

    // Style header row - increase height and enable wrapping
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    headerRow.height = 25; // Increase header row height

    // Add data rows
    clients.forEach((client, index) => {
      const row = worksheet.addRow({
        fullName: client.full_name || '',
        companyName: client.company_name || '',
        fullAddress: client.full_address || '',
        email: client.email || '',
        contactNumber: client.contact_number || '',
      });

      // Enable text wrapping for all cells
      row.eachCell((cell, colNumber) => {
        cell.alignment = { 
          wrapText: true, // Enable wrapping for all columns
          vertical: 'top', 
          horizontal: 'left' 
        };
        // Ensure cell is treated as text and preserve newlines
        if (cell.value !== null && cell.value !== undefined) {
          const cellValue = String(cell.value);
          // Normalize newlines for Excel
          cell.value = cellValue.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        }
      });

      // Set row height to match header height
      row.height = 25;
    });

    // Auto-size columns based on content - ensure headers and all data fit
    worksheet.columns.forEach((column, index) => {
      let maxLength = 10;
      
      // Check header - ensure it fits
      const headerCell = worksheet.getCell(1, index + 1);
      if (headerCell.value) {
        maxLength = Math.max(maxLength, String(headerCell.value).length);
      }
      
      // Check ALL data cells to find the longest value
      for (let i = 0; i < clients.length; i++) {
        const cell = worksheet.getCell(i + 2, index + 1);
        if (cell.value !== null && cell.value !== undefined) {
          const cellValue = String(cell.value);
          // For addresses, we want to allow longer text but still set a reasonable width
          if (column.key === 'fullAddress') {
            // For addresses, use a generous width but don't limit too much
            maxLength = Math.max(maxLength, Math.min(cellValue.length, 100));
          } else {
            maxLength = Math.max(maxLength, cellValue.length);
          }
        }
      }
      
      // Set column width - keep narrower since we're using text wrapping
      // Add minimal padding since text will wrap
      const padding = 3;
      if (column.key === 'fullAddress') {
        // Address column: keep narrower, allow wrapping
        column.width = Math.max(maxLength + padding, 35);
      } else {
        // Other columns: keep at reasonable width
        column.width = Math.max(maxLength + padding, column.width || 15);
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
