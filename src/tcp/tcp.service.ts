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
   * TCP CLIENTS
   * ============================================================
   */
  private readonly clients = new Map<string, TcpClient>();

  /**
   * ============================================================
   * NMEA PROCESSOR
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
           * ==================================================
           * AUTO RECONNECT
           * ==================================================
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
     * CONNECT
     * ========================================================
     */
    client.connect();
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
   *
   * Menggabungkan:
   *
   * TCP
   * NMEA
   * AIS
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
       * RESPONSE
       * ======================================================
       */
      return {
        ...receiver,

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
