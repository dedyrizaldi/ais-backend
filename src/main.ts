import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  console.log('========================================');
  console.log('🚢 AIS BACKEND STARTING');
  console.log('========================================');

  try {
    console.log('📦 Creating NestJS application...');

    const app = await NestFactory.create(AppModule);

    console.log('✅ NestJS application created');

    app.enableCors({
      origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],

      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],

      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],

      credentials: true,
    });

    const port = Number(process.env.PORT || 3000);

    console.log(`🌐 Starting HTTP server on port ${port}...`);

    await app.listen(port);

    console.log('========================================');
    console.log(`🚀 AIS Backend running on port ${port}`);
    console.log(`🌍 http://localhost:${port}`);
    console.log('========================================');
  } catch (error) {
    console.error('========================================');
    console.error('❌ FAILED TO START AIS BACKEND');
    console.error('========================================');

    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    } else {
      console.error(error);
    }

    process.exit(1);
  }
}

bootstrap();
