import { Caterer, CatererSearchParams, CatererListResponse, CreateCatererDTO } from '../models/caterer';

export interface CatererRepository {
  create(caterer: CreateCatererDTO): Promise<Caterer>;
  findById(id: number): Promise<Caterer | null>;
  findAll(params: CatererSearchParams): Promise<CatererListResponse>;
  update(id: number, caterer: Partial<CreateCatererDTO>): Promise<Caterer | null>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: number[]): Promise<number>;
  count(): Promise<number>;
  findDuplicate(caterer: CreateCatererDTO): Promise<Caterer | null>;
}

