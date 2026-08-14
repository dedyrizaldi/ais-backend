import 'dotenv/config';

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaMariaDb } from '@prisma/adapter-mariadb';

import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const host = process.env.DB_HOST?.trim() || '127.0.0.1';
    const port = Number(process.env.DB_PORT || 3306);

    const user = process.env.DB_USERNAME?.trim() || '';
    const password = process.env.DB_PASSWORD ?? '';
    const database = process.env.DB_DATABASE?.trim() || '';

    if (!user) {
      throw new Error(
        'DB_USERNAME is not defined. Please configure DB_USERNAME in your environment.',
      );
    }

    if (!database) {
      throw new Error(
        'DB_DATABASE is not defined. Please configure DB_DATABASE in your environment.',
      );
    }

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Invalid DB_PORT: ${process.env.DB_PORT}`);
    }

    console.log(
      `[Prisma] Connecting to ${host}:${port}/${database} as ${user}`,
    );

    const adapter = new PrismaMariaDb({
      host,
      port,
      user,
      password,
      database,

      // Connection pool
      connectionLimit: 5,

      // Connection timeout
      connectTimeout: 10000,

      // Connection acquire timeout
      acquireTimeout: 10000,
    });

    super({
      adapter,
    });
  }

  async onModuleInit(): Promise<void> {
    console.log('[Prisma] Connecting to database...');

    try {
      await this.$connect();

      console.log('[Prisma] Database connected successfully');
    } catch (error) {
      console.error('[Prisma] Database connection failed:', error);

      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    console.log('[Prisma] Disconnecting from database...');

    try {
      await this.$disconnect();

      console.log('[Prisma] Database disconnected');
    } catch (error) {
      console.error('[Prisma] Database disconnect failed:', error);
    }
  }
}
