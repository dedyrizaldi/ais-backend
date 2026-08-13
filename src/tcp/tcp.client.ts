import * as net from 'node:net';

import {
  ConnectionOptions,
  TcpClientEvents,
} from './interfaces/tcp-client.interface';

import { LoggerService } from '../logger/logger.service';

export class TcpClient {
  /**
   * ============================================================
   * SOCKET
   * ============================================================
   */
  private socket?: net.Socket;

  /**
   * ============================================================
   * CONNECTION STATUS
   * ============================================================
   */
  private connected = false;

  /**
   * ============================================================
   * DATA STATISTICS
   * ============================================================
   *
   * Jumlah event "data" yang diterima
   * dari TCP socket.
   *
   * CATATAN:
   *
   * Ini bukan jumlah NMEA sentence.
   *
   * TCP merupakan stream sehingga satu event
   * data dapat berisi:
   *
   * - satu sentence
   * - beberapa sentence
   * - sebagian sentence
   */
  private messageCount = 0;

  /**
   * ============================================================
   * LAST DATA AT
   * ============================================================
   *
   * Waktu terakhir menerima data dari socket.
   */
  private lastMessageAt?: Date;

  /**
   * ============================================================
   * LAST ERROR
   * ============================================================
   *
   * Menyimpan error terakhir dari socket.
   */
  private lastError?: string;

  /**
   * ============================================================
   * CONSTRUCTOR
   * ============================================================
   */
  constructor(
    private readonly options: ConnectionOptions,

    private readonly events: TcpClientEvents,

    private readonly logger: LoggerService,
  ) {}

  /**
   * ============================================================
   * CONNECT
   * ============================================================
   */
  connect(): void {
    /**
     * Jangan membuat socket baru jika
     * masih terkoneksi.
     */
    if (this.connected) {
      return;
    }

    /**
     * ========================================================
     * CONNECTING
     * ========================================================
     */
    this.logger.tcp(
      `Connecting -> ${this.options.name} ` +
        `(${this.options.host}:${this.options.port})`,
    );

    /**
     * ========================================================
     * CREATE TCP SOCKET
     * ========================================================
     */
    this.socket = net.createConnection(
      {
        host: this.options.host,
        port: this.options.port,
      },

      /**
       * ====================================================
       * CONNECTED
       * ====================================================
       */
      () => {
        this.connected = true;

        /**
         * Reset error setelah berhasil connect.
         */
        this.lastError = undefined;

        this.logger.tcp(
          `Connected -> ${this.options.name} ` +
            `(${this.options.host}:${this.options.port})`,
        );

        this.events.connected?.(this.options);
      },
    );

    /**
     * ========================================================
     * UTF-8
     * ========================================================
     *
     * AIS NMEA merupakan text stream.
     */
    this.socket.setEncoding('utf8');

    /**
     * ========================================================
     * DATA
     * ========================================================
     *
     * PENTING:
     *
     * Jangan log raw TCP data.
     *
     * Receiver AIS dapat mengirim data
     * terus-menerus.
     *
     * Raw data tetap diteruskan ke TcpService.
     */
    this.socket.on('data', (data: string) => {
      /**
       * ====================================================
       * UPDATE STATISTICS
       * ====================================================
       */
      this.messageCount += 1;

      this.lastMessageAt = new Date();

      /**
       * ====================================================
       * FORWARD DATA
       * ====================================================
       */
      this.events.data?.(this.options, data);
    });

    /**
     * ========================================================
     * CLOSE
     * ========================================================
     */
    this.socket.on('close', () => {
      this.connected = false;

      this.logger.tcp(`Disconnected -> ${this.options.name}`);

      this.events.disconnected?.(this.options);
    });

    /**
     * ========================================================
     * ERROR
     * ========================================================
     */
    this.socket.on('error', (error: Error) => {
      this.connected = false;

      /**
       * Simpan error terakhir.
       */
      this.lastError = error.message;

      this.logger.error(`[TCP][${this.options.name}] ` + `${error.message}`);

      this.events.error?.(this.options, error);
    });
  }

  /**
   * ============================================================
   * RECONNECT
   * ============================================================
   */
  reconnect(): void {
    /**
     * Putuskan koneksi lama.
     */
    this.disconnect();

    this.logger.tcp(`Reconnect -> ${this.options.name}`);

    /**
     * Buat koneksi baru.
     */
    this.connect();
  }

  /**
   * ============================================================
   * DISCONNECT
   * ============================================================
   */
  disconnect(): void {
    /**
     * Tidak ada socket.
     */
    if (!this.socket) {
      return;
    }

    /**
     * Tandai disconnected.
     */
    this.connected = false;

    /**
     * Hapus semua listener.
     */
    this.socket.removeAllListeners();

    /**
     * Destroy socket.
     */
    this.socket.destroy();

    /**
     * Reset reference.
     */
    this.socket = undefined;
  }

  /**
   * ============================================================
   * IS CONNECTED
   * ============================================================
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * ============================================================
   * GET OPTIONS
   * ============================================================
   */
  getOptions(): ConnectionOptions {
    return this.options;
  }

  /**
   * ============================================================
   * GET MESSAGE COUNT
   * ============================================================
   *
   * Mengembalikan jumlah event data
   * yang diterima dari socket.
   */
  getMessageCount(): number {
    return this.messageCount;
  }

  /**
   * ============================================================
   * GET LAST MESSAGE AT
   * ============================================================
   *
   * Mengembalikan waktu terakhir
   * menerima data.
   */
  getLastMessageAt(): Date | undefined {
    return this.lastMessageAt;
  }

  /**
   * ============================================================
   * GET LAST ERROR
   * ============================================================
   */
  getLastError(): string | undefined {
    return this.lastError;
  }

  /**
   * ============================================================
   * HAS DATA
   * ============================================================
   *
   * Mengecek apakah receiver pernah
   * menerima data.
   */
  hasReceivedData(): boolean {
    return this.messageCount > 0;
  }

  /**
   * ============================================================
   * IS RECEIVING
   * ============================================================
   *
   * Mengecek apakah receiver sedang
   * menerima data berdasarkan timestamp.
   *
   * Default:
   *
   * 60 detik.
   */
  isReceiving(timeoutMs = 60_000): boolean {
    /**
     * Belum pernah menerima data.
     */
    if (!this.lastMessageAt) {
      return false;
    }

    const elapsed = Date.now() - this.lastMessageAt.getTime();

    return elapsed <= timeoutMs;
  }
}
