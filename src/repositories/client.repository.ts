import { Client, ClientSearchParams, ClientListResponse, CreateClientDTO } from '../models/client';

export interface ClientRepository {
  create(client: CreateClientDTO): Promise<Client>;
  findById(id: number): Promise<Client | null>;
  findAll(params: ClientSearchParams): Promise<ClientListResponse>;
  update(id: number, client: Partial<CreateClientDTO>): Promise<Client | null>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: number[]): Promise<number>;
  count(): Promise<number>;
  findDuplicate(client: CreateClientDTO): Promise<Client | null>;
}
