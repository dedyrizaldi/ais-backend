import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrismaService } from '../database/prisma.service';

import { ReceiverConnection, VtsConfig } from './interfaces/vts.interface';

@Injectable()
export class ReceiverService implements OnModuleInit, OnModuleDestroy {
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

  /**
   * Menandakan seluruh receiver dari vts.json
   * sudah berhasil disinkronkan ke database.
   */

  private databaseReady = false;

  /**
   * Menandakan proses sync sedang berjalan.
   */

  private syncRunning = false;

  /**
   * Timer retry database.
   */

  private syncRetryTimer?: NodeJS.Timeout;

  /**
   * Delay retry database.
   *
   * 15 detik.
   */

  private readonly syncRetryDelay = 15_000;

  /**
   * ============================================================
   * DATABASE READY PROMISE
   * ============================================================
   *
   * TcpService akan menunggu Promise ini sebelum
   * mulai melakukan koneksi ke VTS.
   *
   * Penting:
   *
   * Promise ini TIDAK di-await langsung dari
   * onModuleInit().
   *
   * Jadi NestJS tetap bisa melakukan listen().
   */

  private resolveDatabaseReady!: () => void;

  private readonly databaseReadyPromise = new Promise<void>((resolve) => {
    this.resolveDatabaseReady = resolve;
  });

  /**
   * ============================================================
   * CONSTRUCTOR
   * ============================================================
   */

  constructor(private readonly prisma: PrismaService) {}

  /**
   * ============================================================
   * MODULE INIT
   * ============================================================
   *
   * Jangan await database sync di sini.
   *
   * Tujuannya supaya HTTP server NestJS tetap bisa
   * startup dengan cepat di Hostinger.
   *
   * Receiver akan di-load dan database sync berjalan
   * di background.
   *
   * TcpService akan menunggu databaseReadyPromise.
   */

  onModuleInit(): void {
    void this.loadReceivers(false);
  }

  /**
   * ============================================================
   * MODULE DESTROY
   * ============================================================
   */

  onModuleDestroy(): void {
    /**
     * Hentikan retry database ketika aplikasi
     * sedang shutdown.
     */

    if (this.syncRetryTimer) {
      clearTimeout(this.syncRetryTimer);

      this.syncRetryTimer = undefined;
    }
  }

  /**
   * ============================================================
   * LOAD RECEIVERS
   * ============================================================
   *
   * Membaca konfigurasi receiver dari vts.json.
   *
   * Production:
   *
   * dist/src/receiver/data/vts.json
   *
   * Development:
   *
   * src/receiver/data/vts.json
   */

  private async loadReceivers(syncDatabase = true): Promise<void> {
    /**
     * ========================================================
     * FILE PATH
     * ========================================================
     */

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

      /**
       * Jika dipanggil secara manual melalui reload(),
       * tandai database sudah siap.
       */

      this.markDatabaseReady();
    } else {
      /**
       * Jalankan sync di background.
       *
       * TcpService akan menunggu
       * databaseReadyPromise.
       */

      void this.syncDatabaseWithRetry();
    }
  }

  /**
   * ============================================================
   * DATABASE SYNC WITH RETRY
   * ============================================================
   *
   * Melakukan sinkronisasi receiver ke database.
   *
   * Jika gagal:
   *
   * 15 detik
   * 15 detik
   * 15 detik
   * ...
   */

  private async syncDatabaseWithRetry(): Promise<void> {
    /**
     * Jangan jalankan dua proses sync bersamaan.
     */

    if (this.syncRunning) {
      return;
    }

    this.syncRunning = true;

    try {
      /**
       * ======================================================
       * SYNC
       * ======================================================
       */

      await this.syncDatabase();

      /**
       * ======================================================
       * DATABASE READY
       * ======================================================
       *
       * Sampai titik ini berarti seluruh receiver
       * berhasil di-upsert.
       */

      this.markDatabaseReady();

      this.logger.log(
        'Receiver database synchronization completed successfully',
      );

      this.logger.log('Receiver database is ready.');
    } catch (error: unknown) {
      /**
       * ======================================================
       * SYNC FAILED
       * ======================================================
       */

      this.databaseReady = false;

      this.logger.error(
        'Receiver database synchronization failed.',
        error instanceof Error ? error.stack : String(error),
      );

      this.logger.warn(
        `Retrying receiver database synchronization in ${
          this.syncRetryDelay / 1000
        } seconds...`,
      );

      /**
       * ======================================================
       * RETRY
       * ======================================================
       */

      this.syncRetryTimer = setTimeout(() => {
        this.syncRetryTimer = undefined;

        this.syncRunning = false;

        void this.syncDatabaseWithRetry();
      }, this.syncRetryDelay);

      return;
    }

    /**
     * Sync selesai dengan sukses.
     */

    this.syncRunning = false;
  }

  /**
   * ============================================================
   * MARK DATABASE READY
   * ============================================================
   */

  private markDatabaseReady(): void {
    /**
     * Jangan resolve berkali-kali.
     */

    if (this.databaseReady) {
      return;
    }

    this.databaseReady = true;

    /**
     * Lepaskan TcpService yang sedang menunggu.
     */

    this.resolveDatabaseReady();
  }

  /**
   * ============================================================
   * SYNC DATABASE
   * ============================================================
   *
   * Sinkronisasi seluruh receiver dari vts.json
   * ke database.
   */

  private async syncDatabase(): Promise<void> {
    /**
     * ========================================================
     * NO RECEIVER
     * ========================================================
     */

    if (this.receivers.length === 0) {
      this.logger.warn('No AIS receivers found in configuration.');

      return;
    }

    /**
     * ========================================================
     * SEQUENTIAL DATABASE SYNC
     * ========================================================
     *
     * Gunakan sequential query.
     *
     * Jangan Promise.all() karena jumlah receiver
     * cukup banyak dan bisa membebani connection pool.
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
      } catch (error: unknown) {
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
   * WAIT UNTIL DATABASE READY
   * ============================================================
   *
   * Dipanggil oleh TcpService.
   *
   * TcpService tidak akan memulai koneksi TCP
   * sebelum receiver selesai disinkronkan.
   */

  async waitUntilDatabaseReady(): Promise<void> {
    /**
     * Database sudah ready.
     */

    if (this.databaseReady) {
      return;
    }

    this.logger.log('Waiting for receiver database synchronization...');

    /**
     * Tunggu sampai sync berhasil.
     */

    await this.databaseReadyPromise;

    this.logger.log('Receiver database is ready.');
  }

  /**
   * ============================================================
   * DATABASE READY STATUS
   * ============================================================
   */

  isDatabaseReady(): boolean {
    return this.databaseReady;
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
   *
   * Membaca ulang vts.json dan melakukan
   * sinkronisasi kembali ke database.
   *
   * Pada reload kita boleh menunggu sync karena
   * method ini dipanggil secara manual setelah
   * aplikasi sudah berjalan.
   */

  async reload(): Promise<void> {
    /**
     * Reset ready state hanya untuk status internal.
     *
     * Promise databaseReady tidak dibuat ulang karena
     * TcpService hanya membutuhkan readiness saat
     * initial startup.
     */

    this.databaseReady = false;

    /**
     * Load ulang configuration dan sync database.
     */

    await this.loadReceivers(true);

    /**
     * loadReceivers(true) sudah memanggil
     * markDatabaseReady().
     */
  }
}
