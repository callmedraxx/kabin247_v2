import { TaxCharge, TaxChargeSearchParams, TaxChargeListResponse, CreateTaxChargeDTO, UpdateTaxChargeDTO } from '../models/tax-charge';

export interface TaxChargeRepository {
  create(taxCharge: CreateTaxChargeDTO): Promise<TaxCharge>;
  findById(id: number): Promise<TaxCharge | null>;
  findAll(params: TaxChargeSearchParams): Promise<TaxChargeListResponse>;
  update(id: number, taxCharge: UpdateTaxChargeDTO): Promise<TaxCharge | null>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: number[]): Promise<number>;
  count(): Promise<number>;
}
