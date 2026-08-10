import { Injectable, OnModuleInit } from '@nestjs/common';

import { ReceiverService } from '../receiver/receiver.service';
import { ReceiverConnection } from '../receiver/interfaces/vts.interface';

import { NmeaProcessor } from '../nmea/nmea.processor';
import { NmeaService } from '../nmea/nmea.service';

import { LoggerService } from '../logger/logger.service';

import { TcpClient } from './tcp.client';

@Injectable()
export class TcpService implements OnModuleInit {
  /**
   * ============================================================
   * SELURUH KONEKSI TCP
   * ============================================================
   */
  private readonly clients = new Map<string, TcpClient>();

  /**
   * ============================================================
   * NMEA STREAM PROCESSOR
   * ============================================================
   */
  private readonly processor = new NmeaProcessor();

  constructor(
    private readonly receiverService: ReceiverService,
    private readonly nmeaService: NmeaService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * ============================================================
   * MODULE INIT
   * ============================================================
   */
  onModuleInit(): void {
    this.initialize();
  }

  /**
   * ============================================================
   * INITIALIZE RECEIVERS
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
    const client = new TcpClient(
      receiver,
      {
        /**
         * ==================================================
         * CONNECTED
         * ==================================================
         */
        connected: (receiver) => {
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
           * Auto reconnect.
           *
           * Tunggu 5 detik sebelum mencoba
           * koneksi kembali.
           */
          setTimeout(() => {
            this.logger.tcp(`Reconnect -> ${receiver.name}`);

            client.connect();
          }, 5000);
        },

        /**
         * ==================================================
         * DATA
         * ==================================================
         *
         * Semua raw TCP data langsung diberikan
         * kepada NmeaProcessor.
         *
         * Tidak ada console.log.
         *
         * Tidak ada console.warn.
         *
         * Tidak ada dump raw AIS.
         */
        data: (receiver, data) => {
          /**
           * ==================================================
           * NMEA PROCESSOR
           * ==================================================
           *
           * TCP merupakan stream.
           *
           * NmeaProcessor bertugas:
           *
           * 1. Menangani buffer
           * 2. Memisahkan sentence
           * 3. Normalisasi Tag Block
           * 4. Mendeteksi tipe NMEA
           */
          const messages = this.processor.process(
            receiver.id,
            receiver.name,
            data,
          );

          /**
           * ==================================================
           * NMEA SERVICE
           * ==================================================
           *
           * AIS akan diteruskan ke:
           *
           * NmeaService
           *     ↓
           * AisService
           */
          this.nmeaService.handle(messages);
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
     * CONNECT
     * ========================================================
     */
    client.connect();
  }

  /**
   * ============================================================
   * ALL CLIENTS
   * ============================================================
   */
  findAll(): Map<string, TcpClient> {
    return this.clients;
  }

  /**
   * ============================================================
   * FIND ONE CLIENT
   * ============================================================
   */
  findOne(id: string): TcpClient | undefined {
    return this.clients.get(id);
  }

  /**
   * ============================================================
   * CONNECTED RECEIVER COUNT
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
   * TOTAL RECEIVER COUNT
   * ============================================================
   */
  getTotalCount(): number {
    return this.clients.size;
  }

  /**
   * ============================================================
   * RECEIVER STATUS
   * ============================================================
   */
  getStatus(): Array<
    ReceiverConnection & {
      connected: boolean;
    }
  > {
    return Array.from(this.clients.values()).map((client) => ({
      ...client.getOptions(),

      connected: client.isConnected(),
    }));
  }
}
