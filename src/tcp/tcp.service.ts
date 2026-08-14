import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { ReceiverService } from '../receiver/receiver.service';
import { ReceiverConnection } from '../receiver/interfaces/vts.interface';

import { NmeaProcessor } from '../nmea/nmea.processor';
import { NmeaService } from '../nmea/nmea.service';

import { LoggerService } from '../logger/logger.service';

import { TcpClient } from './tcp.client';

@Injectable()
export class TcpService implements OnModuleInit, OnModuleDestroy {
  /**
   * ============================================================
   * TCP CLIENTS
   * ============================================================
   */

  private readonly clients = new Map<string, TcpClient>();

  /**
   * ============================================================
   * INACTIVE RECEIVERS
   * ============================================================
   *
   * Receiver yang gagal konek akan masuk ke kelompok
   * inactive.
   *
   * Receiver inactive tidak akan melakukan reconnect
   * terus-menerus.
   *
   * Retry dilakukan setiap 24 jam.
   */

  private readonly inactiveReceivers = new Set<string>();

  /**
   * ============================================================
   * RECONNECT TIMERS
   * ============================================================
   *
   * Satu timer untuk setiap receiver.
   */

  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();

  /**
   * ============================================================
   * RECONNECT ATTEMPTS
   * ============================================================
   *
   * Menyimpan jumlah percobaan reconnect
   * masing-masing receiver.
   */

  private readonly reconnectAttempts = new Map<string, number>();

  /**
   * ============================================================
   * RECONNECT CONFIGURATION
   * ============================================================
   *
   * Retry receiver inactive:
   *
   * 24 jam
   * 24 jam
   * 24 jam
   * ...
   */

  private readonly reconnectDelay = 24 * 60 * 60 * 1000;

  /**
   * ============================================================
   * NMEA PROCESSOR
   * ============================================================
   */

  private readonly processor = new NmeaProcessor();

  /**
   * ============================================================
   * INITIALIZATION STATE
   * ============================================================
   *
   * Mencegah initialize() dijalankan lebih dari satu kali.
   */

  private initialized = false;

  /**
   * ============================================================
   * CONSTRUCTOR
   * ============================================================
   */

  constructor(
    private readonly receiverService: ReceiverService,

    private readonly nmeaService: NmeaService,

    private readonly logger: LoggerService,
  ) {}

  /**
   * ============================================================
   * MODULE INIT
   * ============================================================
   *
   * Jangan await database secara langsung di sini.
   *
   * NestJS tetap bisa melakukan listen().
   *
   * TcpService akan menunggu ReceiverService
   * secara asynchronous.
   */

  onModuleInit(): void {
    void this.initializeWhenDatabaseReady();
  }

  /**
   * ============================================================
   * INITIALIZE WHEN DATABASE READY
   * ============================================================
   *
   * TCP tidak boleh connect ke VTS sebelum seluruh
   * receiver dari vts.json selesai disinkronkan
   * ke database.
   */

  private async initializeWhenDatabaseReady(): Promise<void> {
    try {
      this.logger.app(
        'Waiting for receiver database to be ready before starting TCP connections...',
      );

      /**
       * ========================================================
       * WAIT DATABASE
       * ========================================================
       */

      await this.receiverService.waitUntilDatabaseReady();

      /**
       * ========================================================
       * PREVENT DOUBLE INITIALIZATION
       * ========================================================
       */

      if (this.initialized) {
        return;
      }

      this.initialized = true;

      /**
       * ========================================================
       * DATABASE READY
       * ========================================================
       */

      this.logger.app('Receiver database ready. Starting TCP connections...');

      /**
       * ========================================================
       * START TCP
       * ========================================================
       */

      this.initialize();
    } catch (error: unknown) {
      this.logger.error(
        `Failed to initialize TCP connections after receiver database became ready: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * ============================================================
   * MODULE DESTROY
   * ============================================================
   */

  onModuleDestroy(): void {
    this.logger.app('Stopping TCP receiver reconnect timers...');

    /**
     * ========================================================
     * CLEAR RECONNECT TIMERS
     * ========================================================
     */

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }

    this.reconnectTimers.clear();

    /**
     * ========================================================
     * CLEAR RECONNECT STATE
     * ========================================================
     */

    this.reconnectAttempts.clear();

    this.inactiveReceivers.clear();

    /**
     * ========================================================
     * DISCONNECT CLIENTS
     * ========================================================
     */

    for (const client of this.clients.values()) {
      try {
        client.disconnect();
      } catch {
        // Ignore shutdown errors.
      }
    }

    this.clients.clear();

    /**
     * ========================================================
     * RESET INITIALIZATION STATE
     * ========================================================
     */

    this.initialized = false;

    this.logger.app('TCP receiver connections stopped.');
  }

  /**
   * ============================================================
   * INITIALIZE
   * ============================================================
   */

  private initialize(): void {
    const receivers = this.receiverService.findAll();

    this.logger.app(`Initializing ${receivers.length} receiver(s)...`);

    for (const receiver of receivers) {
      this.createConnection(receiver);
    }
  }

  /**
   * ============================================================
   * CREATE TCP CONNECTION
   * ============================================================
   */

  private createConnection(receiver: ReceiverConnection): void {
    /**
     * Jangan membuat TCP client kedua untuk
     * receiver yang sama.
     */

    if (this.clients.has(receiver.id)) {
      this.logger.tcp(`TCP client already exists for receiver: ${receiver.id}`);

      return;
    }

    /**
     * ========================================================
     * CREATE TCP CLIENT
     * ========================================================
     */

    const client = new TcpClient(
      receiver,

      {
        /**
         * ==================================================
         * CONNECTED
         * ==================================================
         */

        connected: (receiver) => {
          /**
           * Apakah receiver sebelumnya inactive?
           */

          const wasInactive = this.inactiveReceivers.has(receiver.id);

          /**
           * Receiver sekarang aktif.
           */

          this.inactiveReceivers.delete(receiver.id);

          /**
           * Hapus timer reconnect.
           */

          this.clearReconnectTimer(receiver.id);

          /**
           * Ambil jumlah attempt sebelumnya.
           */

          const previousAttempts = this.reconnectAttempts.get(receiver.id) ?? 0;

          /**
           * Jika sebelumnya gagal,
           * tampilkan log connection restored.
           */

          if (wasInactive || previousAttempts > 0) {
            this.logger.tcp(
              `Connection restored -> ${receiver.name} ` +
                `(after ${previousAttempts} retry attempt(s))`,
            );
          }

          /**
           * Reset counter.
           */

          this.reconnectAttempts.set(receiver.id, 0);

          /**
           * Log koneksi normal.
           */

          this.logger.tcp(
            `Connected -> ${receiver.name} ` +
              `(${receiver.host}:${receiver.port})`,
          );
        },

        /**
         * ==================================================
         * DISCONNECTED
         * ==================================================
         */

        disconnected: (receiver) => {
          this.logger.tcp(`Disconnected -> ${receiver.name}`);

          /**
           * Masukkan ke kelompok inactive.
           */

          this.inactiveReceivers.add(receiver.id);

          /**
           * Jadwalkan retry 24 jam.
           */

          this.scheduleReconnect(receiver, client);
        },

        /**
         * ==================================================
         * DATA
         * ==================================================
         */

        data: (receiver, data) => {
          /**
           * ==================================================
           * PROCESS NMEA
           * ==================================================
           */

          const messages = this.processor.process(
            receiver.id,
            receiver.name,
            data,
          );

          /**
           * ==================================================
           * SEND TO NMEA SERVICE
           * ==================================================
           */

          if (messages.length > 0) {
            this.nmeaService.handle(messages);
          }
        },

        /**
         * ==================================================
         * ERROR
         * ==================================================
         */

        error: (receiver, error) => {
          this.logger.error(`[${receiver.name}] ${error.message}`);
        },
      },

      this.logger,
    );

    /**
     * ========================================================
     * SAVE CLIENT
     * ========================================================
     */

    this.clients.set(receiver.id, client);

    /**
     * ========================================================
     * INITIAL CONNECT
     * ========================================================
     */

    this.logger.tcp(
      `Initial connection -> ${receiver.name} ` +
        `(${receiver.host}:${receiver.port})`,
    );

    client.connect();
  }

  /**
   * ============================================================
   * SCHEDULE RECONNECT
   * ============================================================
   *
   * VTS gagal:
   *
   * INACTIVE
   *    ↓
   * 24 jam
   *    ↓
   * reconnect
   *
   * Jika gagal:
   *
   * INACTIVE
   *    ↓
   * 24 jam
   *    ↓
   * reconnect
   */

  private scheduleReconnect(
    receiver: ReceiverConnection,
    client: TcpClient,
  ): void {
    /**
     * ========================================================
     * PREVENT DUPLICATE TIMER
     * ========================================================
     */

    if (this.reconnectTimers.has(receiver.id)) {
      return;
    }

    /**
     * ========================================================
     * GET PREVIOUS ATTEMPT
     * ========================================================
     */

    const previousAttempt = this.reconnectAttempts.get(receiver.id) ?? 0;

    /**
     * ========================================================
     * NEXT ATTEMPT
     * ========================================================
     */

    const attempt = previousAttempt + 1;

    this.reconnectAttempts.set(receiver.id, attempt);

    /**
     * ========================================================
     * MARK INACTIVE
     * ========================================================
     */

    this.inactiveReceivers.add(receiver.id);

    /**
     * ========================================================
     * LOG
     * ========================================================
     */

    this.logger.tcp(
      `Receiver inactive -> ${receiver.name}. ` +
        `Next reconnect in 24 hours ` +
        `(attempt ${attempt}).`,
    );

    /**
     * ========================================================
     * CREATE TIMER
     * ========================================================
     */

    const timer = setTimeout(() => {
      /**
       * Timer sudah selesai.
       */

      this.reconnectTimers.delete(receiver.id);

      /**
       * ==================================================
       * CHECK CURRENT CONNECTION
       * ==================================================
       */

      if (client.isConnected()) {
        this.inactiveReceivers.delete(receiver.id);

        this.reconnectAttempts.set(receiver.id, 0);

        return;
      }

      /**
       * ==================================================
       * RETRY CONNECTION
       * ==================================================
       */

      this.logger.tcp(
        `24-hour reconnect -> ${receiver.name} ` + `(attempt ${attempt})`,
      );

      client.connect();
    }, this.reconnectDelay);

    /**
     * ========================================================
     * SAVE TIMER
     * ========================================================
     */

    this.reconnectTimers.set(receiver.id, timer);
  }

  /**
   * ============================================================
   * CLEAR RECONNECT TIMER
   * ============================================================
   */

  private clearReconnectTimer(receiverId: string): void {
    const timer = this.reconnectTimers.get(receiverId);

    if (!timer) {
      return;
    }

    clearTimeout(timer);

    this.reconnectTimers.delete(receiverId);
  }

  /**
   * ============================================================
   * FIND ALL
   * ============================================================
   */

  findAll(): Map<string, TcpClient> {
    return this.clients;
  }

  /**
   * ============================================================
   * FIND ONE
   * ============================================================
   */

  findOne(id: string): TcpClient | undefined {
    return this.clients.get(id);
  }

  /**
   * ============================================================
   * CONNECTED COUNT
   * ============================================================
   */

  getConnectedCount(): number {
    let total = 0;

    for (const client of this.clients.values()) {
      if (client.isConnected()) {
        total++;
      }
    }

    return total;
  }

  /**
   * ============================================================
   * TOTAL COUNT
   * ============================================================
   */

  getTotalCount(): number {
    return this.clients.size;
  }

  /**
   * ============================================================
   * GET STATUS
   * ============================================================
   */

  getStatus() {
    return Array.from(this.clients.values()).map((client) => {
      /**
       * ======================================================
       * RECEIVER
       * ======================================================
       */

      const receiver = client.getOptions();

      /**
       * ======================================================
       * NMEA STATISTICS
       * ======================================================
       */

      const nmea = this.processor.getStats(receiver.id);

      /**
       * ======================================================
       * AIS STATISTICS
       * ======================================================
       */

      const ais = this.nmeaService.getAisStats(receiver.id);

      /**
       * ======================================================
       * RECONNECT ATTEMPT
       * ======================================================
       */

      const reconnectAttempt = this.reconnectAttempts.get(receiver.id) ?? 0;

      /**
       * ======================================================
       * INACTIVE
       * ======================================================
       */

      const inactive = this.inactiveReceivers.has(receiver.id);

      /**
       * ======================================================
       * RECONNECT TIMER
       * ======================================================
       */

      const reconnectScheduled = this.reconnectTimers.has(receiver.id);

      /**
       * ======================================================
       * STATUS
       * ======================================================
       */

      let status: 'CONNECTED' | 'INACTIVE' | 'DISCONNECTED';

      if (client.isConnected()) {
        status = 'CONNECTED';
      } else if (inactive) {
        status = 'INACTIVE';
      } else {
        status = 'DISCONNECTED';
      }

      /**
       * ======================================================
       * RESPONSE
       * ======================================================
       */

      return {
        ...receiver,

        /**
         * ==================================================
         * STATUS
         * ==================================================
         */

        status,

        /**
         * ==================================================
         * TCP
         * ==================================================
         */

        connected: client.isConnected(),

        receiving: client.isReceiving(60_000),

        messageCount: client.getMessageCount(),

        lastMessageAt: client.getLastMessageAt() ?? null,

        lastError: client.getLastError() ?? null,

        /**
         * ==================================================
         * RECONNECT
         * ==================================================
         */

        reconnect: {
          attempt: reconnectAttempt,

          scheduled: reconnectScheduled,

          interval: '24 hours',
        },

        /**
         * ==================================================
         * NMEA
         * ==================================================
         */

        nmea: {
          total: nmea.total,

          ais: nmea.ais,

          gps: nmea.gps,

          vendor: nmea.vendor,

          unknown: nmea.unknown,
        },

        /**
         * ==================================================
         * AIS
         * ==================================================
         */

        ais: {
          received: ais.received,

          parsed: ais.parsed,

          assembled: ais.assembled,

          decoded: ais.decoded,

          failed: ais.failed,

          vesselUpdated: ais.vesselUpdated,

          lastDecodedAt: ais.lastDecodedAt,
        },
      };
    });
  }
}
