import { User, CreateUserDTO, UpdateUserDTO } from '../models/user';

export interface UserRepository {
  create(user: CreateUserDTO): Promise<User>;
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  update(id: number, user: UpdateUserDTO): Promise<User | null>;
  updatePassword(id: number, passwordHash: string): Promise<void>;
  count(): Promise<number>;
  adminExists(): Promise<boolean>;
  countAdmins(): Promise<number>;
}

