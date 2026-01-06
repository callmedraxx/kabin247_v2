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
    await createFBOTable();
    await createOrdersTable();
    await createCategoriesTable();
    await createMenuItemsTable();
    await createAddonItemsTable();
    await createInventoryTable();
    await createTaxChargesTable();
    await createUsersTable();
    await createRefreshTokensTable();
    await createInvitesTable();
    await createPasswordResetOtpsTable();
    await createPaymentTables();
  }
}

async function createAirportsTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS airports (
      id SERIAL PRIMARY KEY,
      airport_name VARCHAR(255) NOT NULL,
      airport_code_iata CHAR(3),
      airport_code_icao CHAR(4),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_airports_iata ON airports(airport_code_iata);
    CREATE INDEX IF NOT EXISTS idx_airports_icao ON airports(airport_code_icao);
    CREATE INDEX IF NOT EXISTS idx_airports_name ON airports(airport_name);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Airports table created successfully');
  } catch (error) {
    console.error('Error creating airports table:', error);
    // Don't throw - table might already exist
  }

  // Remove FBO columns from existing deployments if they exist
  try {
    await dbAdapter!.query(`ALTER TABLE airports DROP COLUMN IF EXISTS fbo_name;`);
    await dbAdapter!.query(`ALTER TABLE airports DROP COLUMN IF EXISTS fbo_email;`);
    await dbAdapter!.query(`ALTER TABLE airports DROP COLUMN IF EXISTS fbo_phone;`);
    await dbAdapter!.query(`DROP INDEX IF EXISTS idx_airports_fbo_name;`);
  } catch (error) {
    console.error('Error removing FBO columns from airports table:', error);
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

async function createFBOTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS fbos (
      id SERIAL PRIMARY KEY,
      fbo_name VARCHAR(255) NOT NULL,
      fbo_email VARCHAR(255),
      fbo_phone VARCHAR(50),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_fbos_name ON fbos(fbo_name);
    CREATE INDEX IF NOT EXISTS idx_fbos_email ON fbos(fbo_email);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('FBOs table created successfully');
  } catch (error) {
    console.error('Error creating fbos table:', error);
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
      fbo_id INTEGER REFERENCES fbos(id),
      client_name VARCHAR(255) NOT NULL,
      caterer VARCHAR(255) NOT NULL,
      airport VARCHAR(255) NOT NULL,
      aircraft_tail_number VARCHAR(50),
      delivery_date DATE NOT NULL,
      delivery_time VARCHAR(10) NOT NULL,
      order_priority VARCHAR(20) NOT NULL CHECK (order_priority IN ('low', 'normal', 'high', 'urgent')),
      payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('card', 'ACH')),
      status VARCHAR(50) NOT NULL DEFAULT 'awaiting_quote' CHECK (status IN ('awaiting_quote', 'awaiting_client_approval', 'awaiting_caterer', 'caterer_confirmed', 'in_preparation', 'ready_for_delivery', 'delivered', 'paid', 'cancelled', 'order_changed')),
      order_type VARCHAR(50) NOT NULL CHECK (order_type IN ('Inflight order', 'QE Serv Hub Order', 'Restaurant Pickup Order')),
      description TEXT,
      notes TEXT,
      reheating_instructions TEXT,
      packaging_instructions TEXT,
      dietary_restrictions TEXT,
      delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      service_charge DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      coordination_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      airport_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      fbo_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      shopping_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      restaurant_pickup_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      airport_pickup_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      revision_count INTEGER NOT NULL DEFAULT 0,
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
      portion_serving VARCHAR(255),
      price DECIMAL(10,2) NOT NULL CHECK (price > 0),
      category VARCHAR(255),
      packaging VARCHAR(255),
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    
    -- Add category, packaging, and portion_serving columns if they don't exist (for existing databases)
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'category') THEN
        ALTER TABLE order_items ADD COLUMN category VARCHAR(255);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'packaging') THEN
        ALTER TABLE order_items ADD COLUMN packaging VARCHAR(255);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'portion_serving') THEN
        ALTER TABLE order_items ADD COLUMN portion_serving VARCHAR(255);
      END IF;
    END $$;
    
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

  // Ensure columns exist in existing deployments and create indexes
  try {
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS caterer_id INTEGER REFERENCES caterers(id);`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS airport_id INTEGER REFERENCES airports(id);`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fbo_id INTEGER REFERENCES fbos(id);`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) CHECK (order_type IN ('Inflight order', 'QE Serv Hub Order', 'Restaurant Pickup Order'));`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00;`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coordination_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00;`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS airport_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00;`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS fbo_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00;`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shopping_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00;`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_pickup_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00;`);
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS airport_pickup_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00;`);
    await dbAdapter!.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS menu_item_id INTEGER REFERENCES menu_items(id);`);
    
    // Create indexes after columns are ensured to exist
    await dbAdapter!.query(`CREATE INDEX IF NOT EXISTS idx_orders_fbo_id ON orders(fbo_id);`);
    await dbAdapter!.query(`CREATE INDEX IF NOT EXISTS idx_orders_order_type ON orders(order_type);`);
  } catch (error) {
    console.error('Error altering orders/order_items tables:', error);
  }

  // Update status constraint for existing databases to include new statuses
  try {
    await dbAdapter!.query(`
      ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
      ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('awaiting_quote', 'awaiting_client_approval', 'awaiting_caterer', 'caterer_confirmed', 'in_preparation', 'ready_for_delivery', 'delivered', 'paid', 'cancelled', 'order_changed'));
    `);
    console.log('Status constraint updated successfully');
  } catch (error) {
    console.error('Error updating status constraint:', error);
  }

  // Add revision_count column to orders for existing databases
  try {
    await dbAdapter!.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS revision_count INTEGER NOT NULL DEFAULT 0;`);
    console.log('revision_count column added to orders');
  } catch (error) {
    console.error('Error adding revision_count column:', error);
  }

  // Add company_name column to clients for existing databases
  try {
    await dbAdapter!.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);`);
    console.log('company_name column added to clients');
  } catch (error) {
    console.error('Error adding company_name column:', error);
  }

  // Add additional_emails column to clients for existing databases (JSONB array of emails)
  try {
    await dbAdapter!.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS additional_emails JSONB DEFAULT '[]'::jsonb;`);
    console.log('additional_emails column added to clients');
  } catch (error) {
    console.error('Error adding additional_emails column to clients:', error);
  }

  // Add additional_emails column to caterers for existing databases (JSONB array of emails)
  try {
    await dbAdapter!.query(`ALTER TABLE caterers ADD COLUMN IF NOT EXISTS additional_emails JSONB DEFAULT '[]'::jsonb;`);
    console.log('additional_emails column added to caterers');
  } catch (error) {
    console.error('Error adding additional_emails column to caterers:', error);
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
    
    CREATE TABLE IF NOT EXISTS menu_item_variant_caterer_prices (
      id SERIAL PRIMARY KEY,
      variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
      caterer_id INTEGER NOT NULL REFERENCES caterers(id),
      price DECIMAL(10,2) NOT NULL CHECK (price > 0),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(variant_id, caterer_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
    CREATE INDEX IF NOT EXISTS idx_menu_items_food_type ON menu_items(food_type);
    CREATE INDEX IF NOT EXISTS idx_menu_items_active ON menu_items(is_active);
    CREATE INDEX IF NOT EXISTS idx_variants_menu_item ON menu_item_variants(menu_item_id);
    CREATE INDEX IF NOT EXISTS idx_variant_caterer_prices_variant ON menu_item_variant_caterer_prices(variant_id);
    CREATE INDEX IF NOT EXISTS idx_variant_caterer_prices_caterer ON menu_item_variant_caterer_prices(caterer_id);
    CREATE INDEX IF NOT EXISTS idx_variant_caterer_prices_composite ON menu_item_variant_caterer_prices(variant_id, caterer_id);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Menu items and variants tables created successfully');
  } catch (error) {
    console.error('Error creating menu items tables:', error);
  }

  // Ensure menu_item_variant_caterer_prices table exists for existing deployments
  try {
    await dbAdapter!.query(`
      CREATE TABLE IF NOT EXISTS menu_item_variant_caterer_prices (
        id SERIAL PRIMARY KEY,
        variant_id INTEGER NOT NULL REFERENCES menu_item_variants(id) ON DELETE CASCADE,
        caterer_id INTEGER NOT NULL REFERENCES caterers(id),
        price DECIMAL(10,2) NOT NULL CHECK (price > 0),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(variant_id, caterer_id)
      );
    `);
    await dbAdapter!.query(`CREATE INDEX IF NOT EXISTS idx_variant_caterer_prices_variant ON menu_item_variant_caterer_prices(variant_id);`);
    await dbAdapter!.query(`CREATE INDEX IF NOT EXISTS idx_variant_caterer_prices_caterer ON menu_item_variant_caterer_prices(caterer_id);`);
    await dbAdapter!.query(`CREATE INDEX IF NOT EXISTS idx_variant_caterer_prices_composite ON menu_item_variant_caterer_prices(variant_id, caterer_id);`);
  } catch (error) {
    console.error('Error creating menu_item_variant_caterer_prices table:', error);
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

async function createUsersTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(10) NOT NULL CHECK (role IN ('ADMIN', 'CSR')),
      is_active BOOLEAN NOT NULL DEFAULT true,
      permissions JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Users table created successfully');
  } catch (error) {
    console.error('Error creating users table:', error);
  }
}

async function createRefreshTokensTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      jti UUID NOT NULL UNIQUE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      revoked_at TIMESTAMP WITH TIME ZONE,
      user_agent TEXT,
      ip INET,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_jti ON refresh_tokens(jti);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Refresh tokens table created successfully');
  } catch (error) {
    console.error('Error creating refresh_tokens table:', error);
  }
}

async function createInvitesTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS invites (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) NOT NULL,
      role VARCHAR(10) NOT NULL CHECK (role = 'CSR'),
      permissions JSONB NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used_at TIMESTAMP WITH TIME ZONE,
      invited_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
    CREATE INDEX IF NOT EXISTS idx_invites_expires_at ON invites(expires_at);
    CREATE INDEX IF NOT EXISTS idx_invites_token_hash ON invites(token_hash);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Invites table created successfully');
  } catch (error) {
    console.error('Error creating invites table:', error);
  }
}

async function createPasswordResetOtpsTable(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS password_reset_otps (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used_at TIMESTAMP WITH TIME ZONE,
      request_count INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_password_reset_otps_user_id ON password_reset_otps(user_id);
    CREATE INDEX IF NOT EXISTS idx_password_reset_otps_expires_at ON password_reset_otps(expires_at);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Password reset OTPs table created successfully');
  } catch (error) {
    console.error('Error creating password_reset_otps table:', error);
  }
}

async function createPaymentTables(): Promise<void> {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      square_payment_id VARCHAR(255) NOT NULL UNIQUE,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'USD',
      payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('card', 'ACH', 'cash_app_pay', 'afterpay', 'other')),
      card_last_4 VARCHAR(4),
      card_brand VARCHAR(50),
      status VARCHAR(50) NOT NULL CHECK (status IN ('completed', 'failed', 'refunded', 'pending')),
      square_customer_id VARCHAR(255),
      square_card_id VARCHAR(255),
      error_message TEXT,
      processed_by INTEGER NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE TABLE IF NOT EXISTS stored_cards (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      square_customer_id VARCHAR(255) NOT NULL,
      square_card_id VARCHAR(255) NOT NULL,
      card_last_4 VARCHAR(4) NOT NULL,
      card_brand VARCHAR(50) NOT NULL,
      card_exp_month INTEGER,
      card_exp_year INTEGER,
      is_default BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(square_customer_id, square_card_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_square_payment_id ON payment_transactions(square_payment_id);
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_processed_by ON payment_transactions(processed_by);
    CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_stored_cards_client_id ON stored_cards(client_id);
    CREATE INDEX IF NOT EXISTS idx_stored_cards_square_customer_id ON stored_cards(square_customer_id);
    CREATE INDEX IF NOT EXISTS idx_stored_cards_is_default ON stored_cards(is_default);
  `;
  
  try {
    await dbAdapter!.query(createTableQuery);
    console.log('Payment tables created successfully');
  } catch (error) {
    console.error('Error creating payment tables:', error);
  }
}

export function getDatabase(): DatabaseAdapter {
  if (!dbAdapter) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return dbAdapter;
}

