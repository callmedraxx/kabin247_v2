import { DatabaseAdapter } from './adapter';
import { PostgreSQLAdapter } from './postgresql';
import { InMemoryAdapter } from './in-memory';

let dbAdapter: DatabaseAdapter | null = null;

export async function initializeDatabase(): Promise<void> {
  const dbType = process.env.DB_TYPE || 'memory';
  const nodeEnv = process.env.NODE_ENV || 'development';

  // Use in-memory for development or when explicitly set
  if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
    console.log('Initializing in-memory database...');
    dbAdapter = new InMemoryAdapter();
  } else {
    console.log('Initializing PostgreSQL database...');
    dbAdapter = new PostgreSQLAdapter({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'kabin247',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });
  }

  await dbAdapter.connect();
  
  // Create tables if using PostgreSQL
  if (dbType === 'postgres' || (nodeEnv === 'production' && dbType !== 'memory')) {
    await createAirportsTable();
    await createCaterersTable();
    await createClientsTable();
    await createOrdersTable();
    await createCategoriesTable();
    await createMenuItemsTable();
    await createAddonItemsTable();
    await createInventoryTable();
    await createTaxChargesTable();
  }
}

async function createAirportsTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS airports (
      id SERIAL PRIMARY KEY,
      airport_name VARCHAR(255) NOT NULL,
      fbo_name VARCHAR(255) NOT NULL,
      fbo_email VARCHAR(255),
      fbo_phone VARCHAR(50),
      airport_code_iata CHAR(3),
      airport_code_icao CHAR(4),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_airports_iata ON airports(airport_code_iata);
    CREATE INDEX IF NOT EXISTS idx_airports_icao ON airports(airport_code_icao);
    CREATE INDEX IF NOT EXISTS idx_airports_name ON airports(airport_name);
    CREATE INDEX IF NOT EXISTS idx_airports_fbo_name ON airports(fbo_name);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Airports table created successfully');
  } catch (error) {
    console.error('Error creating airports table:', error);
    // Don't throw - table might already exist
  }
}

async function createCaterersTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS caterers (
      id SERIAL PRIMARY KEY,
      caterer_name VARCHAR(255) NOT NULL,
      caterer_number VARCHAR(255) NOT NULL,
      caterer_email VARCHAR(255),
      airport_code_iata CHAR(3),
      airport_code_icao CHAR(4),
      time_zone VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_caterers_iata ON caterers(airport_code_iata);
    CREATE INDEX IF NOT EXISTS idx_caterers_icao ON caterers(airport_code_icao);
    CREATE INDEX IF NOT EXISTS idx_caterers_name ON caterers(caterer_name);
    CREATE INDEX IF NOT EXISTS idx_caterers_number ON caterers(caterer_number);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Caterers table created successfully');
  } catch (error) {
    console.error('Error creating caterers table:', error);
    // Don't throw - table might already exist
  }
}

async function createClientsTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      full_address TEXT NOT NULL,
      email VARCHAR(255),
      contact_number VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(full_name);
    CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Clients table created successfully');
  } catch (error) {
    console.error('Error creating clients table:', error);
    // Don't throw - table might already exist
  }
}

async function createOrdersTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number VARCHAR(50) NOT NULL UNIQUE,
      client_id INTEGER REFERENCES clients(id),
      caterer_id INTEGER REFERENCES caterers(id),
      airport_id INTEGER REFERENCES airports(id),
      client_name VARCHAR(255) NOT NULL,
      caterer VARCHAR(255) NOT NULL,
      airport VARCHAR(255) NOT NULL,
      aircraft_tail_number VARCHAR(50),
      delivery_date DATE NOT NULL,
      delivery_time VARCHAR(10) NOT NULL,
      order_priority VARCHAR(20) NOT NULL CHECK (order_priority IN ('low', 'normal', 'high', 'urgent')),
      payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('card', 'ACH')),
      status VARCHAR(50) NOT NULL DEFAULT 'awaiting_quote' CHECK (status IN ('awaiting_quote', 'awaiting_caterer', 'quote_sent', 'quote_approved', 'in_preparation', 'ready_for_delivery', 'delivered', 'cancelled')),
      description TEXT,
      notes TEXT,
      reheating_instructions TEXT,
      packaging_instructions TEXT,
      dietary_restrictions TEXT,
      service_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      completed_at TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS order_pdfs (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      pdf_data BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id INTEGER REFERENCES menu_items(id),
      item_name VARCHAR(255) NOT NULL,
      item_description TEXT,
      portion_size VARCHAR(255) NOT NULL,
      price DECIMAL(10,2) NOT NULL CHECK (price > 0),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_orders_client_name ON orders(client_name);
    CREATE INDEX IF NOT EXISTS idx_orders_caterer ON orders(caterer);
    CREATE INDEX IF NOT EXISTS idx_orders_airport ON orders(airport);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders(client_id);
    CREATE INDEX IF NOT EXISTS idx_orders_caterer_id ON orders(caterer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_airport_id ON orders(airport_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Orders and order_items tables created successfully');
  } catch (error) {
    console.error('Error creating orders tables:', error);
    // Don't throw - table might already exist
  }

  // Ensure columns exist in existing deployments
  try {
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS caterer_id INTEGER REFERENCES caterers(id);`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS airport_id INTEGER REFERENCES airports(id);`);
    await dbAdapter!.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS menu_item_id INTEGER REFERENCES menu_items(id);`);
  } catch (error) {
    console.error('Error altering orders/order_items tables:', error);
  }
}

async function createCategoriesTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT,
      icon VARCHAR(100),
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
    CREATE INDEX IF NOT EXISTS idx_categories_display_order ON categories(display_order);
    CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Categories table created successfully');
  } catch (error) {
    console.error('Error creating categories table:', error);
  }
}

async function createMenuItemsTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      item_name VARCHAR(255) NOT NULL,
      item_description TEXT,
      food_type VARCHAR(20) NOT NULL CHECK (food_type IN ('veg', 'non_veg')),
      category_id INTEGER REFERENCES categories(id),
      image_url TEXT,
      tax_rate DECIMAL(5,2),
      service_charge DECIMAL(10,2),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS menu_item_variants (
      id SERIAL PRIMARY KEY,
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
      portion_size VARCHAR(100) NOT NULL,
      price DECIMAL(10,2) NOT NULL CHECK (price > 0),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_food_type ON menu_items(food_type);
    CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(is_active);
    CREATE INDEX IF NOT EXISTS idx_variants_menu_item ON menu_item_variants(menu_item_id);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Menu items and variants tables created successfully');
  } catch (error) {
    console.error('Error creating menu items tables:', error);
  }
}

async function createAddonItemsTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS addon_items (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL CHECK (price > 0),
      category_id INTEGER REFERENCES categories(id),
      image_url TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_addon_items_category ON addon_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_addon_items_active ON addon_items(is_active);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Addon items table created successfully');
  } catch (error) {
    console.error('Error creating addon items table:', error);
  }
}

async function createInventoryTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS inventory_items (
      id SERIAL PRIMARY KEY,
      item_name VARCHAR(255) NOT NULL,
      category VARCHAR(50) NOT NULL CHECK (category IN ('ingredients', 'beverages', 'packaging', 'utensils', 'cleaning', 'other')),
      current_stock DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
      min_stock_level DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
      max_stock_level DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (max_stock_level >= 0),
      unit VARCHAR(20) NOT NULL CHECK (unit IN ('kg', 'g', 'l', 'ml', 'pcs', 'box', 'pack')),
      unit_price DECIMAL(10,2),
      supplier VARCHAR(255),
      location VARCHAR(255),
      notes TEXT,
      last_updated TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);
    CREATE INDEX IF NOT EXISTS idx_inventory_stock ON inventory_items(current_stock);
    CREATE INDEX IF NOT EXISTS idx_inventory_last_updated ON inventory_items(last_updated);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Inventory items table created successfully');
  } catch (error) {
    console.error('Error creating inventory items table:', error);
  }
}

async function createTaxChargesTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS tax_charges (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('tax', 'service_charge', 'delivery_fee', 'other')),
      rate DECIMAL(10,2) NOT NULL CHECK (rate >= 0),
      is_percentage BOOLEAN NOT NULL DEFAULT true,
      applies_to VARCHAR(50) NOT NULL CHECK (applies_to IN ('all', 'category', 'location', 'item')),
      category_id INTEGER REFERENCES categories(id),
      location VARCHAR(255),
      min_amount DECIMAL(10,2),
      max_amount DECIMAL(10,2),
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_tax_charges_type ON tax_charges(type);
    CREATE INDEX IF NOT EXISTS idx_tax_charges_applies_to ON tax_charges(applies_to);
    CREATE INDEX IF NOT EXISTS idx_tax_charges_active ON tax_charges(is_active);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Tax charges table created successfully');
  } catch (error) {
    console.error('Error creating tax charges table:', error);
  }
}

export function getDatabase(): DatabaseAdapter {
  if (!dbAdapter) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbAdapter;
}

