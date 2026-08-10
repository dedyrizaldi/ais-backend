/* eslint-disable @typescript-eslint/restrict-template-expressions */

import { Injectable } from '@nestjs/common';

import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

@Injectable()
export class LoggerService {
  /**
   * ============================================================
   * APPLICATION LOGGER
   * ============================================================
   */
  private readonly appLogger: winston.Logger;

  /**
   * ============================================================
   * TCP LOGGER
   * ============================================================
   */
  private readonly tcpLogger: winston.Logger;

  /**
   * ============================================================
   * ERROR LOGGER
   * ============================================================
   */
  private readonly errorLogger: winston.Logger;

  constructor() {
    this.appLogger = this.createLogger('app');

    this.tcpLogger = this.createLogger('tcp');

    this.errorLogger = this.createLogger('error', 'error');
  }

  /**
   * ============================================================
   * CREATE WINSTON LOGGER
   * ============================================================
   */
  private createLogger(folder: string, level: string = 'info'): winston.Logger {
    return winston.createLogger({
      level,

      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),

        winston.format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ` + `[${level.toUpperCase()}] ` + `${message}`;
        }),
      ),

      transports: [
        /**
         * ======================================================
         * DAILY ROTATE FILE
         * ======================================================
         */
        new DailyRotateFile({
          dirname: `logs/${folder}`,

          filename: '%DATE%.log',

          datePattern: 'YYYY-MM-DD',

          zippedArchive: false,

          maxSize: '20m',

          maxFiles: '30d',

          level,
        }),

        /**
         * ======================================================
         * CONSOLE
         * ======================================================
         *
         * Hanya pesan yang memang dikirim ke logger
         * yang akan muncul di terminal.
         *
         * Raw AIS/TCP sudah tidak dikirim lagi.
         */
        new winston.transports.Console(),
      ],
    });
  }

  /**
   * ============================================================
   * APPLICATION LOG
   * ============================================================
   */
  app(message: unknown): void {
    this.appLogger.info(this.stringify(message));
  }

  /**
   * ============================================================
   * TCP LOG
   * ============================================================
   *
   * Digunakan hanya untuk:
   *
   * - Connecting
   * - Connected
   * - Disconnected
   * - Reconnect
   *
   * BUKAN raw TCP data.
   */
  tcp(message: unknown): void {
    this.tcpLogger.info(this.stringify(message));
  }

  /**
   * ============================================================
   * ERROR LOG
   * ============================================================
   */
  error(message: unknown): void {
    this.errorLogger.error(this.stringify(message));
  }

  /**
   * ============================================================
   * STRINGIFY
   * ============================================================
   */
  private stringify(value: unknown): string {
    /**
     * String biasa.
     */
    if (typeof value === 'string') {
      return value;
    }

    /**
     * Error object.
     */
    if (value instanceof Error) {
      return `${value.name}: ${value.message}\n` + `${value.stack ?? ''}`;
    }

    /**
     * Object / array.
     */
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
}
