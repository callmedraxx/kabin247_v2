import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: process.env.SWAGGER_TITLE || 'Kabin247 API',
      version: process.env.SWAGGER_VERSION || '1.0.0',
      description: process.env.SWAGGER_DESCRIPTION || 'Kabin247 Backend API Documentation',
    },
    servers: [
      {
        url: process.env.API_URL || 'https://dev.api.kabin247.com',
        description: 'Production API server',
      },
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Local development server',
      },
    ],
  },
  apis: [
    process.env.NODE_ENV === 'production' 
      ? './dist/routes/*.js'
      : './src/routes/*.ts',
    process.env.NODE_ENV === 'production'
      ? './dist/index.js'
      : './src/index.ts'
  ],
};

export function setupSwagger() {
  return swaggerJsdoc(options);
}

