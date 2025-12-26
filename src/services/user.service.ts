import { User, PermissionMap } from '../models/user';
import { getUserRepository } from '../repositories';
import { Logger } from '../utils/logger';

export class UserService {
  private userRepository = getUserRepository();

  /**
   * Create admin account (allows up to 2 admin accounts)
   */
  async createAdminOnce(email: string, password: string): Promise<User> {
    const adminCount = await this.userRepository.countAdmins();
    if (adminCount >= 2) {
      throw new Error('Maximum of 2 admin accounts allowed');
    }

    const user = await this.userRepository.create({
      email,
      password,
      role: 'ADMIN',
    });

    const { password_hash, ...userWithoutPassword } = user;
    return userWithoutPassword as any;
  }

  /**
   * List all employees (CSR users)
   */
  async listEmployees(): Promise<Omit<User, 'password_hash'>[]> {
    const users = await this.userRepository.findAll();
    const employees = users.filter(u => u.role === 'CSR');
    return employees.map(u => {
      const { password_hash, ...userWithoutPassword } = u;
      return userWithoutPassword as any;
    });
  }

  /**
   * Update employee permissions
   */
  async updateEmployeePermissions(id: number, permissions: PermissionMap): Promise<User | null> {
    const user = await this.userRepository.findById(id);
    if (!user || user.role !== 'CSR') {
      return null;
    }

    const updated = await this.userRepository.update(id, { permissions });
    if (!updated) {
      return null;
    }

    const { password_hash, ...userWithoutPassword } = updated;
    return userWithoutPassword as any;
  }

  /**
   * Deactivate employee
   */
  async deactivateEmployee(id: number): Promise<boolean> {
    const user = await this.userRepository.findById(id);
    if (!user || user.role !== 'CSR') {
      return false;
    }

    const updated = await this.userRepository.update(id, { is_active: false });
    return updated !== null;
  }

  /**
   * Reactivate employee
   */
  async reactivateEmployee(id: number): Promise<boolean> {
    const user = await this.userRepository.findById(id);
    if (!user || user.role !== 'CSR') {
      return false;
    }

    const updated = await this.userRepository.update(id, { is_active: true });
    return updated !== null;
  }
}

let userServiceInstance: UserService | null = null;

export function getUserService(): UserService {
  if (!userServiceInstance) {
    userServiceInstance = new UserService();
  }
  return userServiceInstance;
}

