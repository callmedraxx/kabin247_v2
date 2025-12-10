import { AddonItem, AddonItemSearchParams, AddonItemListResponse, CreateAddonItemDTO, UpdateAddonItemDTO } from '../models/addon-item';

export interface AddonItemRepository {
  create(addonItem: CreateAddonItemDTO): Promise<AddonItem>;
  findById(id: number): Promise<AddonItem | null>;
  findAll(params: AddonItemSearchParams): Promise<AddonItemListResponse>;
  update(id: number, addonItem: UpdateAddonItemDTO): Promise<AddonItem | null>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: number[]): Promise<number>;
  count(): Promise<number>;
}
