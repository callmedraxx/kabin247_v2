import { Airport, AirportSearchParams, AirportListResponse, CreateAirportDTO } from '../models/airport';
import { AirportRepository } from './airport.repository';

export class InMemoryAirportRepository implements AirportRepository {
  private airports: Airport[] = [];
  private nextId: number = 1;

  async create(airport: CreateAirportDTO): Promise<Airport> {
    const now = new Date();
    const newAirport: Airport = {
      id: this.nextId++,
      ...airport,
      created_at: now,
      updated_at: now,
    };
    this.airports.push(newAirport);
    return newAirport;
  }

  async findById(id: number): Promise<Airport | null> {
    return this.airports.find(a => a.id === id) || null;
  }

  async findAll(params: AirportSearchParams): Promise<AirportListResponse> {
    let filtered = [...this.airports];

    // Apply search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase();
      filtered = filtered.filter(airport => {
        return (
          airport.airport_name?.toLowerCase().includes(searchLower) ||
          airport.airport_code_iata?.toLowerCase().includes(searchLower) ||
          airport.airport_code_icao?.toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply sorting
    if (params.sortBy) {
      const sortBy = params.sortBy as keyof Airport;
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
      airports: paginated,
      total,
      page: params.page || Math.floor(offset / limit) + 1,
      limit,
      offset,
    };
  }

  async update(id: number, airport: Partial<CreateAirportDTO>): Promise<Airport | null> {
    const index = this.airports.findIndex(a => a.id === id);
    if (index === -1) return null;

    this.airports[index] = {
      ...this.airports[index],
      ...airport,
      updated_at: new Date(),
    };
    return this.airports[index];
  }

  async delete(id: number): Promise<boolean> {
    const index = this.airports.findIndex(a => a.id === id);
    if (index === -1) return false;
    this.airports.splice(index, 1);
    return true;
  }

  async deleteMany(ids: number[]): Promise<number> {
    let deleted = 0;
    ids.forEach(id => {
      const index = this.airports.findIndex(a => a.id === id);
      if (index !== -1) {
        this.airports.splice(index, 1);
        deleted++;
      }
    });
    return deleted;
  }

  async count(): Promise<number> {
    return this.airports.length;
  }
}

