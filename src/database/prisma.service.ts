import * as path from 'node:path';

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import * as dotenv from 'dotenv';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '../generated/prisma/client';

/**
 * ============================================================
 * LOAD ENVIRONMENT
 * ============================================================
 *
 * Local:
 *   <project>/.env
 *
 * Hostinger:
 *   /home/u655749310/domains/ais.becta.co.id/hbuilds/config/.env
 */
function loadEnvironment(): void {
  /**
   * ----------------------------------------------------------
   * Local environment
   * ----------------------------------------------------------
   */
  dotenv.config({
    path: path.resolve(process.cwd(), '.env'),
    override: false,
  });

  /**
   * ----------------------------------------------------------
   * Hostinger environment
   * ----------------------------------------------------------
   */
  const hostingerEnvPath =
    process.env.HBUILD_CONFIG_PATH ||
    '/home/u655749310/domains/ais.becta.co.id/hbuilds/config/.env';

  dotenv.config({
    path: hostingerEnvPath,
    override: true,
  });
}

/**
 * Load environment sebelum PrismaClient dibuat.
 */
loadEnvironment();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    /**
     * ========================================================
     * DATABASE CONFIGURATION
     * ========================================================
     */

    const host = process.env.DB_HOST?.trim() || '127.0.0.1';

    const port = Number(process.env.DB_PORT || 3306);

    const user = process.env.DB_USERNAME?.trim() || '';

    const password = process.env.DB_PASSWORD ?? '';

    const database = process.env.DB_DATABASE?.trim() || '';

    /**
     * ========================================================
     * VALIDATION
     * ========================================================
     */

    if (!user) {
      throw new Error('DB_USERNAME is not defined.');
    }

    if (!database) {
      throw new Error('DB_DATABASE is not defined.');
    }

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Invalid DB_PORT: ${process.env.DB_PORT}`);
    }

    /**
     * ========================================================
     * PRISMA MARIADB ADAPTER
     * ========================================================
     */
    const adapter = new PrismaMariaDb({
      host,
      port,
      user,
      password,
      database,

      /**
       * Shared hosting.
       *
       * Jangan terlalu besar karena Hostinger
       * mempunyai batas connection.
       */
      connectionLimit: 2,

      /**
       * Maksimal menunggu connection dari pool.
       */
      acquireTimeout: 30000,

      /**
       * Maksimal waktu membuat connection.
       */
      connectTimeout: 10000,

      /**
       * Idle connection timeout.
       */
      idleTimeout: 300,

      /**
       * Jeda minimum validasi connection.
       */
      minDelayValidation: 1000,
    });

    /**
     * ========================================================
     * IMPORTANT
     * ========================================================
     *
     * super() HARUS dipanggil sebelum menggunakan this.
     */
    super({
      adapter,
    });

    /**
     * ========================================================
     * SAFE LOG
     * ========================================================
     *
     * Password tidak pernah ditampilkan.
     */
    this.logger.log(
      `Database configuration: ${host}:${port}/${database} as ${user}`,
    );
  }

  /**
   * ==========================================================
   * MODULE DESTROY
   * ==========================================================
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from database...');

    try {
      await this.$disconnect();

      this.logger.log('Database disconnected successfully');
    } catch (error) {
      this.logger.error(
        'Database disconnect failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
