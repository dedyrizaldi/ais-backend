import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  console.log('🚀 Starting AIS Backend...');

  try {
    console.log('📦 Creating Nest application...');

    const app = await NestFactory.create(AppModule);

    console.log('✅ Nest application created');

    app.enableCors({
      origin: ['http://localhost:3001', 'http://127.0.0.1:3001'],
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    });

    const port = Number(process.env.PORT || 3000);

    console.log(`🌐 Starting HTTP server on port ${port}...`);

    await app.listen(port);

    console.log(`🚢 AIS Backend running at http://localhost:${port}`);
    console.log('✅ Server is ready');
  } catch (error) {
    console.error('❌ Failed to start AIS Backend');

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
