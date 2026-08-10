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
   * HANDLE ALL NMEA MESSAGES
   * ============================================================
   *
   * NMEA Service hanya bertugas melakukan routing.
   *
   * AIS  -> AisService
   * GPS  -> GPS handler
   * VENDOR -> Vendor handler
   * UNKNOWN -> Unknown handler
   *
   * Tidak ada logging setiap packet di sini.
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
   * AIS SENTENCE
   * ============================================================
   */
  private handleAis(message: NmeaMessage): void {
    /**
     * ========================================================
     * SEND TO AIS SERVICE
     * ========================================================
     *
     * AisService yang akan:
     *
     * 1. Parse AIS
     * 2. Assemble multipart
     * 3. Decode Type 5 / dynamic message
     * 4. Update VesselCache
     * 5. Broadcast WebSocket
     */
    this.aisService.handle(
      message.receiverId,
      message.receiverName,
      message.raw,
    );
  }

  /**
   * ============================================================
   * GPS SENTENCE
   * ============================================================
   *
   * Untuk sekarang GPS belum diproses.
   *
   * Jangan melakukan logging setiap packet karena
   * receiver dapat mengirim data dengan frekuensi tinggi.
   */
  private handleGps(_message: NmeaMessage): void {
    return;
  }

  /**
   * ============================================================
   * VENDOR SENTENCE
   * ============================================================
   */
  private handleVendor(_message: NmeaMessage): void {
    return;
  }

  /**
   * ============================================================
   * UNKNOWN SENTENCE
   * ============================================================
   */
  private handleUnknown(_message: NmeaMessage): void {
    return;
  }
}
