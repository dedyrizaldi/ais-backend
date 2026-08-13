/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';

import { AisService } from '../ais/ais.service';

import {
  NmeaMessage,
  NmeaSentenceType,
} from './interfaces/nmea-message.interface';

@Injectable()
export class NmeaService {
  constructor(private readonly aisService: AisService) {}

  /**
   * ============================================================
   * HANDLE NMEA MESSAGES
   * ============================================================
   */
  handle(messages: NmeaMessage[]): void {
    for (const message of messages) {
      switch (message.type) {
        /**
         * ======================================================
         * AIS
         * ======================================================
         */
        case NmeaSentenceType.AIS:
          this.handleAis(message);
          break;

        /**
         * ======================================================
         * GPS
         * ======================================================
         */
        case NmeaSentenceType.GPS:
          this.handleGps(message);
          break;

        /**
         * ======================================================
         * VENDOR
         * ======================================================
         */
        case NmeaSentenceType.VENDOR:
          this.handleVendor(message);
          break;

        /**
         * ======================================================
         * UNKNOWN
         * ======================================================
         */
        case NmeaSentenceType.UNKNOWN:
        default:
          this.handleUnknown(message);
          break;
      }
    }
  }

  /**
   * ============================================================
   * HANDLE AIS
   * ============================================================
   */
  private handleAis(message: NmeaMessage): void {
    this.aisService.handle(
      message.receiverId,
      message.receiverName,
      message.raw,
    );
  }

  /**
   * ============================================================
   * HANDLE GPS
   * ============================================================
   */
  private handleGps(_message: NmeaMessage): void {
    /**
     * GPS belum diproses.
     */
  }

  /**
   * ============================================================
   * HANDLE VENDOR
   * ============================================================
   */
  private handleVendor(_message: NmeaMessage): void {
    /**
     * Vendor belum diproses.
     */
  }

  /**
   * ============================================================
   * HANDLE UNKNOWN
   * ============================================================
   */
  private handleUnknown(_message: NmeaMessage): void {
    /**
     * Unknown belum diproses.
     */
  }

  /**
   * ============================================================
   * GET AIS STATISTICS
   * ============================================================
   *
   * Statistik AIS berasal langsung dari
   * AisService.
   */
  getAisStats(receiverId: string) {
    return this.aisService.getStats(receiverId);
  }
}
