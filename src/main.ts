import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    console.log('🚀 Starting AIS Backend...');

    const app = await NestFactory.create(AppModule);

    app.enableCors({
      origin: [
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'https://ais.becta.co.id',
      ],
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    });

    /**
     * ============================================================
     * PORT
     * ============================================================
     *
     * Gunakan PORT yang diberikan oleh environment.
     *
     * Tidak menggunakan fallback 3000.
     *
     * Lokal:
     * PORT harus tersedia di .env
     *
     * Production:
     * PORT diberikan oleh Hostinger Node.js Manager.
     */

    const port = Number(process.env.PORT);

    if (!port) {
      throw new Error('PORT environment variable is not defined.');
    }

    console.log(`🌐 Starting HTTP server on port ${port}...`);

    await app.listen(port, '0.0.0.0');

    console.log(`✅ AIS Backend running on port ${port}`);

    console.log(`🌍 Server listening on 0.0.0.0:${port}`);
  } catch (error) {
    console.error('❌ Failed to start AIS Backend');

    console.error(error);

    process.exit(1);
  }
}

void bootstrap();
