import { Airport, AirportSearchParams, AirportListResponse, CreateAirportDTO } from '../models/airport';

export interface AirportRepository {
  create(airport: CreateAirportDTO): Promise<Airport>;
  findById(id: number): Promise<Airport | null>;
  findAll(params: AirportSearchParams): Promise<AirportListResponse>;
  update(id: number, airport: Partial<CreateAirportDTO>): Promise<Airport | null>;
  delete(id: number): Promise<boolean>;
  deleteMany(ids: number[]): Promise<number>;
  count(): Promise<number>;
}

