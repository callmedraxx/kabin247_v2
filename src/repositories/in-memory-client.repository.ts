import { Client, ClientSearchParams, ClientListResponse, CreateClientDTO } from '../models/client';
import { ClientRepository } from './client.repository';
import { normalizeClientData } from '../utils/client-validation';

export class InMemoryClientRepository implements ClientRepository {
  private clients: Client[] = [];
  private nextId: number = 1;

  async create(client: CreateClientDTO): Promise<Client> {
    const now = new Date();
    const newClient: Client = {
      id: this.nextId++,
      ...client,
      created_at: now,
      updated_at: now,
    };
    this.clients.push(newClient);
    return newClient;
  }

  async findById(id: number): Promise<Client | null> {
    return this.clients.find(c => c.id === id) || null;
  }

  async findAll(params: ClientSearchParams): Promise<ClientListResponse> {
    let filtered = [...this.clients];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(client => {
        return (
          client.full_name?.toLowerCase().includes(searchLower) ||
          client.full_address?.toLowerCase().includes(searchLower) ||
          client.email?.toLowerCase().includes(searchLower) ||
          client.contact_number?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply sorting
    if (params.sortBy) {
      const sortBy = params.sortBy as keyof Client;
      const sortOrder = params.sortOrder || 'asc';
      filtered.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;
        
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    const total = filtered.length;

    // Apply pagination
    const offset = params.offset ?? (params.page && params.limit ? (params.page - 1) * params.limit : 0);
    const limit = params.limit || 50;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      clients: paginated,
      total,
      page: params.page || Math.floor(offset / limit) + 1,
      limit,
      offset,
    };
  }

  async update(id: number, client: Partial<CreateClientDTO>): Promise<Client | null> {
    const index = this.clients.findIndex(c => c.id === id);
    if (index === -1) return null;

    this.clients[index] = {
      ...this.clients[index],
      ...client,
      updated_at: new Date(),
    };
    return this.clients[index];
  }

  async delete(id: number): Promise<boolean> {
    const index = this.clients.findIndex(c => c.id === id);
    if (index === -1) return false;
    this.clients.splice(index, 1);
    return true;
  }

  async deleteMany(ids: number[]): Promise<number> {
    let deleted = 0;
    ids.forEach(id => {
      const index = this.clients.findIndex(c => c.id === id);
      if (index !== -1) {
        this.clients.splice(index, 1);
        deleted++;
      }
    });
    return deleted;
  }

  async count(): Promise<number> {
    return this.clients.length;
  }

  async findDuplicate(client: CreateClientDTO): Promise<Client | null> {
    const normalized = normalizeClientData(client);
    
    return this.clients.find(c => {
      return (
        c.full_name === normalized.full_name &&
        c.full_address === normalized.full_address &&
        (c.email || '') === (normalized.email || '') &&
        (c.contact_number || '') === (normalized.contact_number || '')
      );
    }) || null;
  }

  async updateSquareCustomerId(clientId: number, squareCustomerId: string): Promise<Client | null> {
    const index = this.clients.findIndex(c => c.id === clientId);
    if (index === -1) return null;

    this.clients[index] = {
      ...this.clients[index],
      square_customer_id: squareCustomerId,
      updated_at: new Date(),
    };
    return this.clients[index];
  }
}
