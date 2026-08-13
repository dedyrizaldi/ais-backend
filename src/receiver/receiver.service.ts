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
   *
   * Receiver aktif yang berasal dari vts.json.
   */
  private receivers: ReceiverConnection[] = [];

  /**
   * ============================================================
   * BASE URL
   * ============================================================
   */
  private baseUrl = '';

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ============================================================
   * MODULE INIT
   * ============================================================
   */
  async onModuleInit(): Promise<void> {
    await this.loadReceivers();
  }

  /**
   * ============================================================
   * LOAD RECEIVERS
   * ============================================================
   *
   * Membaca konfigurasi receiver dari vts.json.
   *
   * Development:
   *   src/receiver/data/vts.json
   *
   * Production:
   *   dist/src/receiver/data/vts.json
   *
   * Karena __dirname akan menunjuk ke folder:
   *
   *   dist/src/receiver
   *
   * pada production, maka kita menggunakan:
   *
   *   __dirname/data/vts.json
   */
  private async loadReceivers(): Promise<void> {
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
     *
     * Prioritaskan file yang berada di dekat hasil compiled JS.
     *
     * Production:
     *   dist/src/receiver/data/vts.json
     *
     * Development:
     *   src/receiver/data/vts.json
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

    /**
     * ========================================================
     * DATABASE SYNC
     * ========================================================
     */
    await this.syncDatabase();

    this.logger.log(`Loaded ${this.receivers.length} AIS receivers`);
  }

  /**
   * ============================================================
   * SYNC DATABASE
   * ============================================================
   *
   * Sinkronisasi konfigurasi receiver
   * ke database.
   */
  private async syncDatabase(): Promise<void> {
    for (const receiver of this.receivers) {
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
    }

    this.logger.log(
      `Synchronized ${this.receivers.length} receiver(s) to database`,
    );
  }

  /**
   * ============================================================
   * FIND ALL CONFIG
   * ============================================================
   *
   * Receiver yang berasal dari vts.json.
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
   *
   * Mengambil receiver langsung
   * dari database.
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
   *
   * Mengambil satu receiver berdasarkan ID
   * dari database.
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
   *
   * Membaca ulang vts.json dan
   * melakukan sinkronisasi kembali
   * ke database.
   */
  async reload(): Promise<void> {
    await this.loadReceivers();
  }
}
