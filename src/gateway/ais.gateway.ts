import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

import { LoggerService } from '../logger/logger.service';
import { Vessel } from '../vessel/interfaces/vessel.interface';

@WebSocketGateway({
  cors: {
    origin: '*',
  },

  transports: ['websocket', 'polling'],
})
export class AisGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(private readonly logger: LoggerService) {}

  /**
   * ============================================================
   * CONFIGURATION
   * ============================================================
   */

  /**
   * Minimum interval broadcast untuk vessel.
   *
   * Contoh:
   *
   * 1000 ms = maksimal 1 update / detik / vessel
   *
   * Type 5 tetap langsung dikirim.
   */
  private readonly positionBroadcastInterval = 1000;

  /**
   * Menyimpan waktu terakhir vessel dikirim.
   */
  private readonly lastBroadcast = new Map<string, number>();

  /**
   * ============================================================
   * GATEWAY INIT
   * ============================================================
   */
  afterInit(): void {
    this.logger.app('Socket.IO Gateway Initialized');
  }

  /**
   * ============================================================
   * CLIENT CONNECT
   * ============================================================
   */
  handleConnection(client: Socket): void {
    this.logger.app(
      `Client Connected -> ${client.id} (${this.server.engine.clientsCount} client(s))`,
    );
  }

  /**
   * ============================================================
   * CLIENT DISCONNECT
   * ============================================================
   */
  handleDisconnect(client: Socket): void {
    this.logger.app(
      `Client Disconnected -> ${client.id} (${this.server.engine.clientsCount} client(s))`,
    );
  }

  /**
   * ============================================================
   * BROADCAST ONE VESSEL
   * ============================================================
   *
   * Type 5:
   *
   * langsung dikirim.
   *
   * Type 1/2/3/18/19:
   *
   * dibatasi maksimal 1 update / detik / vessel.
   */
  broadcastVessel(vessel: Vessel): void {
    /**
     * Validasi server.
     */
    if (!this.server) {
      return;
    }

    /**
     * Validasi MMSI.
     */
    if (!vessel.mmsi) {
      return;
    }

    /**
     * ========================================================
     * STATIC DATA
     * ========================================================
     *
     * Type 5 dan Type 24 harus langsung dikirim.
     *
     * Karena static data tidak datang sebanyak
     * position report.
     */
    if (vessel.messageType === 5 || vessel.messageType === 24) {
      this.server.emit('vessel:update', vessel);

      return;
    }

    /**
     * ========================================================
     * POSITION DATA THROTTLE
     * ========================================================
     */
    const now = Date.now();

    const previous = this.lastBroadcast.get(vessel.mmsi);

    /**
     * Kalau vessel baru,
     * langsung kirim.
     */
    if (previous === undefined) {
      this.lastBroadcast.set(vessel.mmsi, now);

      this.server.emit('vessel:update', vessel);

      return;
    }

    /**
     * Batasi update posisi.
     */
    const elapsed = now - previous;

    if (elapsed < this.positionBroadcastInterval) {
      return;
    }

    /**
     * Update timestamp broadcast.
     */
    this.lastBroadcast.set(vessel.mmsi, now);

    /**
     * Broadcast.
     */
    this.server.emit('vessel:update', vessel);
  }

  /**
   * ============================================================
   * BROADCAST ALL VESSELS
   * ============================================================
   *
   * Digunakan jika frontend memang meminta
   * seluruh vessel.
   */
  broadcastVessels(vessels: Vessel[]): void {
    if (!this.server) {
      return;
    }

    if (!vessels.length) {
      return;
    }

    this.server.emit('vessel:list', vessels);
  }

  /**
   * ============================================================
   * BROADCAST SYSTEM STATUS
   * ============================================================
   */
  broadcastStatus(data: unknown): void {
    if (!this.server) {
      return;
    }

    this.server.emit('system:status', data);
  }

  /**
   * ============================================================
   * CLIENT COUNT
   * ============================================================
   */
  getClientCount(): number {
    if (!this.server) {
      return 0;
    }

    return this.server.engine.clientsCount;
  }

  /**
   * ============================================================
   * CLEANUP BROADCAST CACHE
   * ============================================================
   *
   * Menghindari Map terus membesar
   * jika ada banyak MMSI lama.
   */
  cleanupBroadcastCache(activeMmsis: Set<string>): void {
    for (const mmsi of this.lastBroadcast.keys()) {
      if (!activeMmsis.has(mmsi)) {
        this.lastBroadcast.delete(mmsi);
      }
    }
  }
}
