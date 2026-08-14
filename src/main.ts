import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

/**
 * ============================================================
 * LOAD HOSTINGER ENVIRONMENT
 * ============================================================
 *
 * Hostinger menyimpan environment file di:
 *
 * /home/u655749310/domains/ais.becta.co.id/hbuilds/config/.env
 *
 * Di local development kita tetap menggunakan:
 *
 * <project>/.env
 *
 * Kita hanya override konfigurasi DATABASE_* / DB_*.
 * PORT tidak kita override agar PORT dari Hostinger
 * tetap digunakan.
 */
function loadEnvironment(): void {
  const hostingerEnvPath =
    process.env.HBUILD_CONFIG_PATH ||
    '/home/u655749310/domains/ais.becta.co.id/hbuilds/config/.env';

  /**
   * ----------------------------------------------------------
   * 1. Load local .env jika tersedia
   * ----------------------------------------------------------
   */
  const localEnvPath = path.resolve(process.cwd(), '.env');

  if (fs.existsSync(localEnvPath)) {
    const localEnv = dotenv.parse(fs.readFileSync(localEnvPath));

    /**
     * Load local environment tanpa menimpa environment
     * yang sudah diberikan oleh sistem.
     */
    for (const [key, value] of Object.entries(localEnv)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }

    console.log(`📄 Loaded local environment: ${localEnvPath}`);
  }

  /**
   * ----------------------------------------------------------
   * 2. Load Hostinger .env
   * ----------------------------------------------------------
   */
  if (fs.existsSync(hostingerEnvPath)) {
    const hostingerEnv = dotenv.parse(fs.readFileSync(hostingerEnvPath));

    /**
     * Variable yang harus menggunakan konfigurasi
     * database dari Hostinger.
     *
     * PORT sengaja TIDAK dimasukkan ke sini karena
     * PORT harus berasal dari Node.js Manager Hostinger.
     */
    const databaseKeys = [
      'DATABASE_URL',
      'DB_HOST',
      'DB_PORT',
      'DB_USERNAME',
      'DB_PASSWORD',
      'DB_DATABASE',
    ];

    for (const key of databaseKeys) {
      if (hostingerEnv[key] !== undefined) {
        process.env[key] = hostingerEnv[key];
      }
    }

    console.log(`📄 Loaded Hostinger database environment`);
  } else {
    console.log(`ℹ️ Hostinger environment file not found: ${hostingerEnvPath}`);
  }

  /**
   * ----------------------------------------------------------
   * 3. Safe database configuration log
   * ----------------------------------------------------------
   *
   * Jangan pernah print password.
   */
  console.log(
    `🗄️ Database: ${process.env.DB_HOST || 'undefined'}:${process.env.DB_PORT || '3306'}/${process.env.DB_DATABASE || 'undefined'}`,
  );

  console.log(`👤 Database user: ${process.env.DB_USERNAME || 'undefined'}`);

  console.log(
    `🔐 Database password: ${process.env.DB_PASSWORD ? 'SET' : 'NOT SET'}`,
  );
}

/**
 * ============================================================
 * LOAD ENV BEFORE NESTJS
 * ============================================================
 *
 * Sangat penting:
 *
 * loadEnvironment()
 * harus dipanggil SEBELUM
 *
 * NestFactory.create(AppModule)
 *
 * karena PrismaService dibuat ketika AppModule
 * diinisialisasi.
 */
loadEnvironment();

/**
 * ============================================================
 * BOOTSTRAP
 * ============================================================
 */
async function bootstrap() {
  try {
    console.log('🚀 Starting AIS Backend...');

    /**
     * NestJS dibuat setelah environment database
     * sudah tersedia.
     */
    const app = await NestFactory.create(AppModule);

    /**
     * ========================================================
     * CORS
     * ========================================================
     */
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
     * ========================================================
     * PORT
     * ========================================================
     *
     * Jangan hard-code port.
     *
     * Hostinger Node.js Manager akan memberikan PORT.
     */
    const port = Number(process.env.PORT);

    if (!port) {
      throw new Error('PORT environment variable is not defined.');
    }

    console.log(`🌐 Starting HTTP server on port ${port}...`);

    /**
     * ========================================================
     * START SERVER
     * ========================================================
     */
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
