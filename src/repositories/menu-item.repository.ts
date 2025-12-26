import { MenuItem, MenuItemSearchParams, MenuItemListResponse, CreateMenuItemDTO, UpdateMenuItemDTO } from '../models/menu-item';

export interface MenuItemRepository {
  create(menuItem: CreateMenuItemDTO): Promise<MenuItem>;
  findById(id: number): Promise<MenuItem | null>;
  findAll(params: MenuItemSearchParams): Promise<MenuItemListResponse>;
  update(id: number, menuItem: UpdateMenuItemDTO): Promise<MenuItem | null>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: number[]): Promise<number>;
  count(): Promise<number>;
  getPriceForVariant(variantId: number, catererId: number | null): Promise<number | null>;
}
