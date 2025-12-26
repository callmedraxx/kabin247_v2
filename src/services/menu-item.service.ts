import { MenuItem, CreateMenuItemDTO, UpdateMenuItemDTO, MenuItemSearchParams, MenuItemListResponse, MenuItemStatusUpdateDTO } from '../models/menu-item';
import { getMenuItemRepository, getCategoryRepository } from '../repositories';
import { validateMenuItem, normalizeMenuItemData } from '../utils/menu-item-validation';
import { Logger } from '../utils/logger';
import * as XLSX from 'xlsx';

export class MenuItemService {
  private repository = getMenuItemRepository();
  private categoryRepository = getCategoryRepository();

  private async validateCategory(categoryIdOrSlug: string): Promise<void> {
    // Check if category exists (by ID or slug)
    const isNumeric = /^\d+$/.test(categoryIdOrSlug);
    const category = isNumeric 
      ? await this.categoryRepository.findById(parseInt(categoryIdOrSlug))
      : await this.categoryRepository.findBySlug(categoryIdOrSlug);
    
    if (!category) {
      throw new Error(`Category not found: ${categoryIdOrSlug}`);
    }
  }

  async createMenuItem(data: CreateMenuItemDTO): Promise<MenuItem> {
    const normalized = normalizeMenuItemData(data);
    const validation = validateMenuItem(normalized);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Validate category exists if provided
    if (normalized.category) {
      await this.validateCategory(normalized.category);
    }

    return this.repository.create(normalized);
  }

  async getMenuItemById(id: number): Promise<MenuItem | null> {
    return this.repository.findById(id);
  }

  async listMenuItems(params: MenuItemSearchParams): Promise<MenuItemListResponse> {
    return this.repository.findAll(params);
  }

  async updateMenuItem(id: number, data: UpdateMenuItemDTO): Promise<MenuItem | null> {
    const normalized = normalizeMenuItemData(data);
    
    if (Object.keys(normalized).length > 0) {
      const validation = validateMenuItem(normalized);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
    }

    // Validate category if provided
    if (normalized.category) {
      await this.validateCategory(normalized.category);
    }

    return this.repository.update(id, normalized);
  }

  async updateMenuItemStatus(id: number, statusData: MenuItemStatusUpdateDTO): Promise<MenuItem | null> {
    return this.repository.update(id, { is_active: statusData.is_active });
  }

  async deleteMenuItem(id: number): Promise<boolean> {
    return this.repository.delete(id);
  }

  async deleteMenuItems(ids: number[]): Promise<number> {
    return this.repository.deleteMany(ids);
  }

  async exportToExcel(): Promise<Buffer> {
    const response = await this.repository.findAll({ limit: 10000 });
    const menuItems = response.menu_items;

    // Prepare data for Excel - each variant gets its own row
    const excelData: any[] = [];
    
    for (const item of menuItems) {
      // If item has variants, create a row for each variant
      if (item.variants && item.variants.length > 0) {
        for (const variant of item.variants) {
          excelData.push({
            'Item Name': item.item_name,
            'Item Description': item.item_description || '',
            'Food Type': item.food_type,
            'Category': item.category || '',
            'Image URL': item.image_url || '',
            'Tax Rate': item.tax_rate || '',
            'Service Charge': item.service_charge || '',
            'Is Active': item.is_active ? 'Yes' : 'No',
            'Portion Size': variant.portion_size,
            'Price': variant.price,
            'Variant Sort Order': variant.sort_order || '',
            'Created At': item.created_at ? new Date(item.created_at).toISOString() : '',
            'Updated At': item.updated_at ? new Date(item.updated_at).toISOString() : '',
          });
        }
      } else {
        // Item with no variants - still export it
        excelData.push({
          'Item Name': item.item_name,
          'Item Description': item.item_description || '',
          'Food Type': item.food_type,
          'Category': item.category || '',
          'Image URL': item.image_url || '',
          'Tax Rate': item.tax_rate || '',
          'Service Charge': item.service_charge || '',
          'Is Active': item.is_active ? 'Yes' : 'No',
          'Portion Size': '',
          'Price': '',
          'Variant Sort Order': '',
          'Created At': item.created_at ? new Date(item.created_at).toISOString() : '',
          'Updated At': item.updated_at ? new Date(item.updated_at).toISOString() : '',
        });
      }
    }

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Menu Items');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return buffer;
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

      // Look for a sheet named "Menu Items" or "Menu Item" (case-insensitive)
      let sheetName = workbook.SheetNames.find(name => {
        const normalized = name.toLowerCase().trim();
        return normalized === 'menu items' || normalized === 'menu item' || normalized === 'menuitems' || normalized === 'menuitem';
      });
      
      if (!sheetName) {
        sheetName = workbook.SheetNames[0];
        Logger.info('Menu Items sheet not found, using first sheet', {
          availableSheets: workbook.SheetNames,
          selectedSheet: sheetName
        });
      } else {
        Logger.info('Found Menu Items sheet', {
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
      
      const allValuesEmpty = Object.values(row).every(val => 
        val === null || val === undefined || val === '' || 
        (typeof val === 'string' && val.trim() === '')
      );
      
      if (allValuesEmpty) return true;
      
      // Also treat rows as empty if they don't have required fields
      const hasRequiredFields = getColumnValue(row, [
        'Item Name', 'item_name', 'Item_Name', 'item name', 'Name', 'name',
        'ITEM NAME', 'ItemName', 'Menu Item Name', 'menu item name'
      ]);
      
      return !hasRequiredFields;
    };

    // Group rows by item name to handle variants
    const itemsMap = new Map<string, any[]>();
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      if (isEmptyRow(row)) {
        continue;
      }

      const itemName = getColumnValue(row, [
        'Item Name', 'item_name', 'Item_Name', 'item name', 'Name', 'name',
        'ITEM NAME', 'ItemName', 'Menu Item Name', 'menu item name'
      ]);

      if (!itemName) {
        errors.push(`Row ${i + 2}: Missing required field (item_name)`);
        continue;
      }

      if (!itemsMap.has(itemName)) {
        itemsMap.set(itemName, []);
      }
      itemsMap.get(itemName)!.push({ rowIndex: i + 2, data: row });
    }

    // Process each unique item
    for (const [itemName, rows] of itemsMap.entries()) {
      try {
        // Use the first row for main item data
        const firstRow = rows[0].data;
        
        const foodTypeValue = getColumnValue(firstRow, [
          'Food Type', 'food_type', 'Food_Type', 'food type', 'Type', 'type',
          'FOOD TYPE', 'FoodType', 'Food Type (veg/non_veg)', 'food type (veg/non_veg)'
        ]);

        if (!foodTypeValue) {
          errors.push(`Row ${rows[0].rowIndex}: Missing required field (food_type)`);
          continue;
        }

        const foodType = foodTypeValue.toLowerCase().trim();
        if (foodType !== 'veg' && foodType !== 'non_veg') {
          errors.push(`Row ${rows[0].rowIndex}: Invalid food_type. Must be 'veg' or 'non_veg'`);
          continue;
        }

        // Collect variants from all rows
        const variants: Array<{ portion_size: string; price: number }> = [];
        
        for (const { data: row } of rows) {
          const portionSize = getColumnValue(row, [
            'Portion Size', 'portion_size', 'Portion_Size', 'portion size',
            'PORTION SIZE', 'PortionSize', 'Size', 'size'
          ]);
          
          const priceStr = getColumnValue(row, [
            'Price', 'price', 'PRICE', 'Price ($)', 'price ($)'
          ]);

          if (portionSize && priceStr) {
            const price = parseFloat(priceStr);
            if (isNaN(price) || price <= 0) {
              errors.push(`Row ${rows[0].rowIndex}: Invalid price for variant "${portionSize}"`);
              continue;
            }
            variants.push({ portion_size: portionSize, price });
          }
        }

        const menuItemData: CreateMenuItemDTO = {
          item_name: itemName,
          item_description: getColumnValue(firstRow, [
            'Item Description', 'item_description', 'Item_Description', 'item description',
            'Description', 'description', 'DESCRIPTION', 'ItemDescription'
          ]) || undefined,
          food_type: foodType as 'veg' | 'non_veg',
          category: getColumnValue(firstRow, [
            'Category', 'category', 'CATEGORY', 'Category ID', 'category id',
            'Category Slug', 'category slug', 'Category_ID', 'Category_Slug'
          ]) || undefined,
          image_url: getColumnValue(firstRow, [
            'Image URL', 'image_url', 'Image_URL', 'image url',
            'IMAGE URL', 'ImageUrl', 'Image', 'image'
          ]) || undefined,
          tax_rate: (() => {
            const value = getColumnValue(firstRow, [
              'Tax Rate', 'tax_rate', 'Tax_Rate', 'tax rate',
              'TAX RATE', 'TaxRate', 'Tax', 'tax'
            ]);
            if (!value) return undefined;
            const parsed = parseFloat(value);
            return isNaN(parsed) ? undefined : parsed;
          })(),
          service_charge: (() => {
            const value = getColumnValue(firstRow, [
              'Service Charge', 'service_charge', 'Service_Charge', 'service charge',
              'SERVICE CHARGE', 'ServiceCharge', 'Service', 'service'
            ]);
            if (!value) return undefined;
            const parsed = parseFloat(value);
            return isNaN(parsed) ? undefined : parsed;
          })(),
          is_active: (() => {
            const activeValue = getColumnValue(firstRow, [
              'Is Active', 'is_active', 'Is_Active', 'is active',
              'IS ACTIVE', 'IsActive', 'Active', 'active', 'Yes', 'yes', 'Y', 'y', 'True', 'true'
            ]);
            if (!activeValue) return true; // Default to true
            const lower = activeValue.toLowerCase();
            return lower === 'yes' || lower === 'y' || lower === 'true' || lower === '1' || lower === 'active';
          })(),
          variants: variants.length > 0 ? variants : undefined,
        };

        const normalized = normalizeMenuItemData(menuItemData);
        const validation = validateMenuItem(normalized);
        
        if (!validation.valid) {
          const errorMsg = `Row ${rows[0].rowIndex}: ${validation.errors.join(', ')}`;
          errors.push(errorMsg);
          Logger.warn(`Row ${rows[0].rowIndex} validation failed`, {
            row: rows[0].rowIndex,
            errors: validation.errors,
            rowData: firstRow,
            extractedData: menuItemData,
          });
          continue;
        }

        // Validate category if provided
        if (normalized.category) {
          try {
            await this.validateCategory(normalized.category);
          } catch (error: any) {
            const errorMsg = `Row ${rows[0].rowIndex}: ${error.message}`;
            errors.push(errorMsg);
            Logger.warn(`Row ${rows[0].rowIndex} category validation failed`, {
              row: rows[0].rowIndex,
              error: error.message,
              category: normalized.category,
            });
            continue;
          }
        }

        await this.repository.create(normalized);
        success++;
      } catch (error: any) {
        const errorMsg = `Row ${rows[0].rowIndex}: ${error.message || 'Unknown error'}`;
        errors.push(errorMsg);
        Logger.error('Failed to import menu item', error, {
          row: rows[0].rowIndex,
          itemName,
          errorMessage: error.message,
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
}
