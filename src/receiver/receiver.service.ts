import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrismaService } from '../database/prisma.service';

import { ReceiverConnection, VtsConfig } from './interfaces/vts.interface';

@Injectable()
export class ReceiverService implements OnModuleInit {
  private readonly logger = new Logger(ReceiverService.name);

  /**
   * ============================================================
   * RECEIVER CONFIGURATION
   * ============================================================
   */
  private receivers: ReceiverConnection[] = [];

  /**
   * ============================================================
   * BASE URL
   * ============================================================
   */
  private baseUrl = '';

  /**
   * ============================================================
   * DATABASE SYNC STATE
   * ============================================================
   */
  private syncRunning = false;

  private syncRetryTimer?: NodeJS.Timeout;

  /**
   * ============================================================
   * DATABASE SYNC CONFIG
   * ============================================================
   */
  private readonly syncRetryDelay = 15000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ============================================================
   * MODULE INIT
   * ============================================================
   *
   * Jangan menunggu database sync di sini.
   *
   * Tujuannya supaya HTTP server tetap bisa startup
   * walaupun database sedang bermasalah.
   */
  async onModuleInit(): Promise<void> {
    await this.loadReceivers(false);
  }

  /**
   * ============================================================
   * LOAD RECEIVERS
   * ============================================================
   */
  private async loadReceivers(syncDatabase = true): Promise<void> {
    const productionFilePath = path.join(__dirname, 'data', 'vts.json');

    const developmentFilePath = path.join(
      process.cwd(),
      'src',
      'receiver',
      'data',
      'vts.json',
    );

    let filePath: string;

    /**
     * ========================================================
     * FIND CONFIG FILE
     * ========================================================
     */
    if (fs.existsSync(productionFilePath)) {
      filePath = productionFilePath;
    } else if (fs.existsSync(developmentFilePath)) {
      filePath = developmentFilePath;
    } else {
      throw new Error(
        [
          'Receiver file not found.',
          '',
          'Checked paths:',
          `1. ${productionFilePath}`,
          `2. ${developmentFilePath}`,
        ].join('\n'),
      );
    }

    this.logger.log(`Loading receiver configuration: ${filePath}`);

    /**
     * ========================================================
     * READ FILE
     * ========================================================
     */
    const raw = fs.readFileSync(filePath, 'utf8');

    /**
     * ========================================================
     * PARSE CONFIG
     * ========================================================
     */
    const config = JSON.parse(raw) as VtsConfig;

    /**
     * ========================================================
     * BASE URL
     * ========================================================
     */
    this.baseUrl = config.base_url;

    /**
     * ========================================================
     * MAP RECEIVERS
     * ========================================================
     */
    this.receivers = Object.entries(config.listVTS).map(([id, receiver]) => ({
      id,

      name: receiver.name,

      host: receiver.telnet.host,

      port: Number(receiver.telnet.port),

      parser:
        receiver.telnet.parser === 'BSVDM'
          ? 'BSVDM'
          : receiver.telnet.parser === 'AIVDM'
            ? 'AIVDM'
            : 'ABVDM',
    }));

    this.logger.log(`Loaded ${this.receivers.length} AIS receivers`);

    /**
     * ========================================================
     * DATABASE SYNC
     * ========================================================
     *
     * Jangan blok startup.
     */
    if (syncDatabase) {
      await this.syncDatabase();
    } else {
      void this.syncDatabaseWithRetry();
    }
  }

  /**
   * ============================================================
   * DATABASE SYNC WITH RETRY
   * ============================================================
   */
  private async syncDatabaseWithRetry(): Promise<void> {
    if (this.syncRunning) {
      return;
    }

    this.syncRunning = true;

    try {
      await this.syncDatabase();

      this.logger.log(
        'Receiver database synchronization completed successfully',
      );
    } catch (error) {
      this.logger.error(
        'Receiver database synchronization failed.',
        error instanceof Error ? error.stack : String(error),
      );

      this.logger.warn(
        `Retrying receiver database synchronization in ${
          this.syncRetryDelay / 1000
        } seconds...`,
      );

      this.syncRetryTimer = setTimeout(() => {
        this.syncRunning = false;

        void this.syncDatabaseWithRetry();
      }, this.syncRetryDelay);
    }
  }

  /**
   * ============================================================
   * SYNC DATABASE
   * ============================================================
   */
  private async syncDatabase(): Promise<void> {
    if (this.receivers.length === 0) {
      this.logger.warn('No AIS receivers found in configuration.');

      return;
    }

    /**
     * Gunakan sequential query.
     *
     * Jangan Promise.all() agar connection pool
     * tidak dibebani sekaligus.
     */
    for (const receiver of this.receivers) {
      try {
        await this.prisma.receiver.upsert({
          where: {
            id: receiver.id,
          },

          create: {
            id: receiver.id,

            name: receiver.name,

            host: receiver.host,

            port: receiver.port,

            status: true,
          },

          update: {
            name: receiver.name,

            host: receiver.host,

            port: receiver.port,

            status: true,
          },
        });

        this.logger.debug(`Receiver synchronized: ${receiver.id}`);
      } catch (error) {
        this.logger.error(
          `Failed to synchronize receiver: ${receiver.id}`,
          error instanceof Error ? error.stack : String(error),
        );

        throw error;
      }
    }

    this.logger.log(
      `Synchronized ${this.receivers.length} receiver(s) to database`,
    );
  }

  /**
   * ============================================================
   * FIND ALL CONFIG
   * ============================================================
   */
  findAll(): ReceiverConnection[] {
    return this.receivers;
  }

  /**
   * ============================================================
   * FIND ONE CONFIG
   * ============================================================
   */
  findById(id: string): ReceiverConnection | undefined {
    return this.receivers.find((receiver) => receiver.id === id);
  }

  /**
   * ============================================================
   * GET BASE URL
   * ============================================================
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * ============================================================
   * FIND ALL FROM DATABASE
   * ============================================================
   */
  async findAllFromDatabase() {
    return this.prisma.receiver.findMany({
      orderBy: {
        name: 'asc',
      },

      select: {
        id: true,

        name: true,

        host: true,

        port: true,

        status: true,

        createdAt: true,

        updatedAt: true,
      },
    });
  }

  /**
   * ============================================================
   * FIND ONE FROM DATABASE
   * ============================================================
   */
  async findOneFromDatabase(id: string) {
    return this.prisma.receiver.findUnique({
      where: {
        id,
      },

      select: {
        id: true,

        name: true,

        host: true,

        port: true,

        status: true,

        createdAt: true,

        updatedAt: true,
      },
    });
  }

  /**
   * ============================================================
   * RELOAD
   * ============================================================
   */
  async reload(): Promise<void> {
    await this.loadReceivers(true);
  }

  /**
   * ============================================================
   * CLEANUP
   * ============================================================
   */
  onModuleDestroy(): void {
    if (this.syncRetryTimer) {
      clearTimeout(this.syncRetryTimer);
    }
  }
}
