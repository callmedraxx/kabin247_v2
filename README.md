# Kabin247 Backend

Express.js backend API with Swagger documentation, Docker support, and flexible database storage.

## Features

- **Express.js** - Fast, unopinionated web framework
- **Swagger/OpenAPI** - Interactive API documentation
- **TypeScript** - Type-safe development
- **Docker** - Containerized deployment
- **PostgreSQL** - Production database
- **In-Memory Storage** - Development database

## Getting Started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose (for production)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration

### Development

Run the development server with in-memory database:
```bash
npm run dev
```

The API will be available at:
- API: http://localhost:3000
- Swagger Docs: http://localhost:3000/api-docs
- Health Check: http://localhost:3000/health

### Production with Docker

1. Build and start services:
```bash
docker-compose -f docker-compose.prod.yml up --build
```

2. Or start only PostgreSQL:
```bash
docker-compose up -d
```

Then set `DB_TYPE=postgres` in your `.env` file and run:
```bash
npm run build
npm start
```

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `DB_TYPE` - Database type: `memory` or `postgres`
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `SWAGGER_TITLE` - Swagger documentation title
- `SWAGGER_VERSION` - API version
- `SWAGGER_DESCRIPTION` - API description

## Project Structure

```
src/
├── config/
│   └── swagger.ts       # Swagger configuration
├── database/
│   ├── adapter.ts       # Database adapter interface
│   ├── postgresql.ts    # PostgreSQL implementation
│   ├── in-memory.ts     # In-memory implementation
│   └── index.ts         # Database initialization
├── routes/
│   └── health.ts        # Health check route
└── index.ts             # Application entry point
```

## Database

The application uses a database adapter pattern that allows switching between:
- **In-Memory** (default for development) - Simple Map-based storage
- **PostgreSQL** (for production) - Full-featured relational database

Set `DB_TYPE=postgres` to use PostgreSQL, or `DB_TYPE=memory` for in-memory storage.

## API Documentation

Swagger documentation is available at `/api-docs` when the server is running.

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server

# kabin247_v2
