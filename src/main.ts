import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('🚀 Starting AIS Backend...');

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
  });

  const port = Number(process.env.PORT) || 3000;

  console.log(`🌐 Starting HTTP server on port ${port}...`);

  await app.listen(port, '0.0.0.0');

  console.log(`✅ AIS Backend running on port ${port}`);
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start AIS Backend');
  console.error(error);
  process.exit(1);
});
