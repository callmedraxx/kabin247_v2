import { getDatabase } from '../database';
import { AirportRepository } from './airport.repository';
import { InMemoryAirportRepository } from './in-memory-airport.repository';
import { PostgreSQLAirportRepository } from './postgresql-airport.repository';
import { CatererRepository } from './caterer.repository';
import { InMemoryCatererRepository } from './in-memory-caterer.repository';
import { PostgreSQLCatererRepository } from './postgresql-caterer.repository';
import { ClientRepository } from './client.repository';
import { InMemoryClientRepository } from './in-memory-client.repository';
import { PostgreSQLClientRepository } from './postgresql-client.repository';
import { OrderRepository } from './order.repository';
import { InMemoryOrderRepository } from './in-memory-order.repository';
import { PostgreSQLOrderRepository } from './postgresql-order.repository';
import { CategoryRepository } from './category.repository';
import { InMemoryCategoryRepository } from './in-memory-category.repository';
import { PostgreSQLCategoryRepository } from './postgresql-category.repository';
import { MenuItemRepository } from './menu-item.repository';
import { InMemoryMenuItemRepository } from './in-memory-menu-item.repository';
import { PostgreSQLMenuItemRepository } from './postgresql-menu-item.repository';
import { AddonItemRepository } from './addon-item.repository';
import { InMemoryAddonItemRepository } from './in-memory-addon-item.repository';
import { PostgreSQLAddonItemRepository } from './postgresql-addon-item.repository';
import { InventoryRepository } from './inventory.repository';
import { InMemoryInventoryRepository } from './in-memory-inventory.repository';
import { PostgreSQLInventoryRepository } from './postgresql-inventory.repository';
import { TaxChargeRepository } from './tax-charge.repository';
import { InMemoryTaxChargeRepository } from './in-memory-tax-charge.repository';
import { PostgreSQLTaxChargeRepository } from './postgresql-tax-charge.repository';
import { FBORepository } from './fbo.repository';
import { InMemoryFBORepository } from './in-memory-fbo.repository';
import { PostgreSQLFBORepository } from './postgresql-fbo.repository';
import { UserRepository } from './user.repository';
import { PostgreSQLUserRepository } from './postgresql-user.repository';
import { InviteRepository } from './invite.repository';
import { PostgreSQLInviteRepository } from './postgresql-invite.repository';
import { RefreshTokenRepository } from './refresh-token.repository';
import { PostgreSQLRefreshTokenRepository } from './postgresql-refresh-token.repository';
import { PasswordResetRepository } from './password-reset.repository';
import { PostgreSQLPasswordResetRepository } from './postgresql-password-reset.repository';
import { PaymentRepository } from './payment.repository';
import { PostgreSQLPaymentRepository } from './postgresql-payment.repository';
import { InvoiceRepository } from './invoice.repository';
import { PostgreSQLInvoiceRepository } from './postgresql-invoice.repository';

let airportRepository: AirportRepository | null = null;
let catererRepository: CatererRepository | null = null;
let clientRepository: ClientRepository | null = null;
let orderRepository: OrderRepository | null = null;
let categoryRepository: CategoryRepository | null = null;
let menuItemRepository: MenuItemRepository | null = null;
let addonItemRepository: AddonItemRepository | null = null;
let inventoryRepository: InventoryRepository | null = null;
let taxChargeRepository: TaxChargeRepository | null = null;
let fboRepository: FBORepository | null = null;

export function getAirportRepository(): AirportRepository {
  if (!airportRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      airportRepository = new InMemoryAirportRepository();
    } else {
      airportRepository = new PostgreSQLAirportRepository(getDatabase());
    }
  }
  return airportRepository;
}

export function getCatererRepository(): CatererRepository {
  if (!catererRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      catererRepository = new InMemoryCatererRepository();
    } else {
      catererRepository = new PostgreSQLCatererRepository(getDatabase());
    }
  }
  return catererRepository;
}

export function getClientRepository(): ClientRepository {
  if (!clientRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      clientRepository = new InMemoryClientRepository();
    } else {
      clientRepository = new PostgreSQLClientRepository(getDatabase());
    }
  }
  return clientRepository;
}

export function getOrderRepository(): OrderRepository {
  if (!orderRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      orderRepository = new InMemoryOrderRepository();
    } else {
      orderRepository = new PostgreSQLOrderRepository(getDatabase());
    }
  }
  return orderRepository;
}

export function getCategoryRepository(): CategoryRepository {
  if (!categoryRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      categoryRepository = new InMemoryCategoryRepository();
    } else {
      categoryRepository = new PostgreSQLCategoryRepository(getDatabase());
    }
  }
  return categoryRepository;
}

export function getMenuItemRepository(): MenuItemRepository {
  if (!menuItemRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      menuItemRepository = new InMemoryMenuItemRepository();
    } else {
      menuItemRepository = new PostgreSQLMenuItemRepository(getDatabase());
    }
  }
  return menuItemRepository;
}

export function getAddonItemRepository(): AddonItemRepository {
  if (!addonItemRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      addonItemRepository = new InMemoryAddonItemRepository();
    } else {
      addonItemRepository = new PostgreSQLAddonItemRepository(getDatabase());
    }
  }
  return addonItemRepository;
}

export function getInventoryRepository(): InventoryRepository {
  if (!inventoryRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      inventoryRepository = new InMemoryInventoryRepository();
    } else {
      inventoryRepository = new PostgreSQLInventoryRepository(getDatabase());
    }
  }
  return inventoryRepository;
}

export function getTaxChargeRepository(): TaxChargeRepository {
  if (!taxChargeRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      taxChargeRepository = new InMemoryTaxChargeRepository();
    } else {
      taxChargeRepository = new PostgreSQLTaxChargeRepository(getDatabase());
    }
  }
  return taxChargeRepository;
}

export function getFBORepository(): FBORepository {
  if (!fboRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      fboRepository = new InMemoryFBORepository();
    } else {
      fboRepository = new PostgreSQLFBORepository(getDatabase());
    }
  }
  return fboRepository;
}

let userRepository: UserRepository | null = null;
let inviteRepository: InviteRepository | null = null;
let refreshTokenRepository: RefreshTokenRepository | null = null;
let passwordResetRepository: PasswordResetRepository | null = null;
let paymentRepository: PaymentRepository | null = null;
let invoiceRepository: InvoiceRepository | null = null;

export function getUserRepository(): UserRepository {
  if (!userRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      throw new Error('User repository requires PostgreSQL');
    } else {
      userRepository = new PostgreSQLUserRepository(getDatabase());
    }
  }
  return userRepository;
}

export function getInviteRepository(): InviteRepository {
  if (!inviteRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      throw new Error('Invite repository requires PostgreSQL');
    } else {
      inviteRepository = new PostgreSQLInviteRepository(getDatabase());
    }
  }
  return inviteRepository;
}

export function getRefreshTokenRepository(): RefreshTokenRepository {
  if (!refreshTokenRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      throw new Error('Refresh token repository requires PostgreSQL');
    } else {
      refreshTokenRepository = new PostgreSQLRefreshTokenRepository(getDatabase());
    }
  }
  return refreshTokenRepository;
}

export function getPasswordResetRepository(): PasswordResetRepository {
  if (!passwordResetRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      throw new Error('Password reset repository requires PostgreSQL');
    } else {
      passwordResetRepository = new PostgreSQLPasswordResetRepository(getDatabase());
    }
  }
  return passwordResetRepository;
}

export function getPaymentRepository(): PaymentRepository {
  if (!paymentRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      throw new Error('Payment repository requires PostgreSQL');
    } else {
      paymentRepository = new PostgreSQLPaymentRepository(getDatabase());
    }
  }
  return paymentRepository;
}

export function getInvoiceRepository(): InvoiceRepository {
  if (!invoiceRepository) {
    const dbType = process.env.DB_TYPE || 'memory';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (dbType === 'memory' || (nodeEnv === 'development' && dbType !== 'postgres')) {
      throw new Error('Invoice repository requires PostgreSQL');
    } else {
      invoiceRepository = new PostgreSQLInvoiceRepository(getDatabase());
    }
  }
  return invoiceRepository;
}

