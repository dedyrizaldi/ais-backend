/* eslint-disable @typescript-eslint/no-unsafe-call */

import { Injectable, Logger } from '@nestjs/common';
import { AisDecode } from 'ais-decoder';

import { CompletedAisMessage } from '../interfaces/completed-ais-message.interface';
import { DecodedAisMessage } from '../interfaces/decoded-ais.interface';

import { AisType5Decoder, AisType5Decoded } from './ais-type5.decoder';

interface AisDecodedInstance {
  valid: boolean;

  aistype: number;

  mmsi: string;

  class?: string;

  lat?: number;

  lon?: number;

  sog?: number;

  cog?: number;

  hdg?: number;

  utc?: number;

  navstatus?: number;

  shipname?: string;

  callsign?: string;

  destination?: string;

  imo?: number;

  shiptype?: number;

  length?: number;

  width?: number;
}

@Injectable()
export class AisDecoderService {
  private readonly logger = new Logger(AisDecoderService.name);

  /**
   * ============================================================
   * AIS DECODER SESSION
   * ============================================================
   *
   * Session dipisahkan berdasarkan receiver.
   *
   * Ini penting karena ais-decoder membutuhkan
   * state internal untuk beberapa jenis message.
   */
  private readonly sessions = new Map<string, object>();

  constructor(private readonly type5Decoder: AisType5Decoder) {}

  /**
   * ============================================================
   * DECODE COMPLETED AIS MESSAGE
   * ============================================================
   */
  decode(message: CompletedAisMessage): DecodedAisMessage | null {
    try {
      /**
       * ========================================================
       * RAW NMEA
       * ========================================================
       */
      const raw = message.raw;

      /**
       * ========================================================
       * NORMALIZE NMEA PREFIX
       * ========================================================
       *
       * Receiver dapat mengirim:
       *
       * !ABVDM
       * !BSVDM
       * !ABVDO
       * !BSVDO
       *
       * ais-decoder membutuhkan:
       *
       * !AIVDM
       * !AIVDO
       */
      const sentence = raw
        .split(/\r?\n/)
        .map((line) =>
          line
            .replace(/^!ABVDM/, '!AIVDM')
            .replace(/^!BSVDM/, '!AIVDM')
            .replace(/^!ABVDO/, '!AIVDO')
            .replace(/^!BSVDO/, '!AIVDO')
            .trim(),
        )
        .filter(Boolean)
        .join('\n');

      if (!sentence) {
        return null;
      }

      /**
       * ========================================================
       * DETECT MESSAGE TYPE
       * ========================================================
       *
       * AIS payload menggunakan 6-bit armored ASCII.
       *
       * 6 bit pertama menentukan message type.
       */
      const messageType = this.getMessageType(message.payload);

      /**
       * ========================================================
       * TYPE 5
       * ========================================================
       *
       * Type 5 merupakan:
       *
       * Static and Voyage Related Data
       *
       * Type 5 adalah multipart message.
       *
       * Fragment sudah dirakit oleh:
       *
       * AisFragmentAssembler
       *
       * Kemudian payload didecode menggunakan:
       *
       * AisType5Decoder
       */
      if (messageType === 5) {
        return this.decodeType5(message);
      }

      /**
       * ========================================================
       * AIS DECODER SESSION
       * ========================================================
       */
      let session = this.sessions.get(message.receiverId);

      if (session === undefined) {
        session = {};

        this.sessions.set(message.receiverId, session);
      }

      /**
       * ========================================================
       * DECODE OTHER AIS TYPES
       * ========================================================
       *
       * Type 1
       * Type 2
       * Type 3
       * Type 18
       * Type 19
       * dan type lain
       *
       * tetap menggunakan ais-decoder.
       */
      const decoded = new AisDecode(
        sentence,
        session,
      ) as unknown as AisDecodedInstance;

      /**
       * ========================================================
       * INVALID
       * ========================================================
       */
      if (!decoded.valid) {
        return null;
      }

      /**
       * ========================================================
       * BUILD RESULT
       * ========================================================
       */
      return {
        receiverId: message.receiverId,

        receiverName: message.receiverName,

        raw: message.raw,

        channel: message.channel,

        valid: decoded.valid,

        messageType: decoded.aistype,

        mmsi: decoded.mmsi,

        vesselClass: decoded.class ?? '',

        /**
         * Dynamic position.
         */
        lat: decoded.lat,

        lon: decoded.lon,

        sog: decoded.sog,

        cog: decoded.cog,

        hdg: decoded.hdg,

        utc: decoded.utc,

        navStatus: decoded.navstatus,

        /**
         * Static data.
         *
         * Clean @ padding.
         */
        shipname: this.cleanAisText(decoded.shipname),

        callsign: this.cleanAisText(decoded.callsign),

        destination: this.cleanAisText(decoded.destination),

        imo: decoded.imo,

        shiptype: decoded.shiptype,

        length: decoded.length,

        width: decoded.width,
      };
    } catch (error: unknown) {
      /**
       * ========================================================
       * ERROR
       * ========================================================
       *
       * Hanya error yang dicatat.
       *
       * Tidak ada:
       *
       * ais-debug.json
       * payload logging
       * packet logging
       */
      if (error instanceof Error) {
        this.logger.error(
          [
            '[AIS DECODE ERROR]',
            `receiver=${message.receiverName}`,
            `message=${error.message}`,
          ].join(' '),
        );
      } else {
        this.logger.error(
          ['[AIS DECODE ERROR]', `receiver=${message.receiverName}`].join(' '),
        );
      }

      return null;
    }
  }

  /**
   * ============================================================
   * GET MESSAGE TYPE
   * ============================================================
   *
   * AIS payload:
   *
   * 6-bit armored ASCII
   *
   * 6 bit pertama = Message Type
   */
  private getMessageType(payload: string): number | null {
    if (!payload) {
      return null;
    }

    const first = payload.charCodeAt(0) - 48;

    let value = first;

    if (value > 40) {
      value -= 8;
    }

    if (value < 0 || value > 63) {
      return null;
    }

    return value;
  }

  /**
   * ============================================================
   * DECODE TYPE 5
   * ============================================================
   */
  private decodeType5(message: CompletedAisMessage): DecodedAisMessage | null {
    const decoded = this.type5Decoder.decode(message.payload, message.fillBits);

    if (!decoded) {
      return null;
    }

    /**
     * ========================================================
     * MAP TYPE 5
     * ========================================================
     *
     * Tidak melakukan console.log.
     *
     * Tidak menulis ais-debug.json.
     */
    return this.mapType5(message, decoded);
  }

  /**
   * ============================================================
   * MAP TYPE 5
   * ============================================================
   *
   * Type 5 hanya mempunyai:
   *
   * - MMSI
   * - Callsign
   * - Ship Name
   * - IMO
   * - Ship Type
   * - Destination
   * - Dimension
   * - ETA
   * - Draught
   *
   * Type 5 TIDAK mempunyai:
   *
   * - Latitude
   * - Longitude
   * - SOG
   * - COG
   * - Heading
   * - Navigation Status
   */
  private mapType5(
    message: CompletedAisMessage,
    decoded: AisType5Decoded,
  ): DecodedAisMessage {
    return {
      receiverId: message.receiverId,

      receiverName: message.receiverName,

      raw: message.raw,

      channel: message.channel,

      valid: true,

      messageType: decoded.messageType,

      mmsi: decoded.mmsi,

      vesselClass: 'A',

      /**
       * ========================================================
       * POSITION
       * ========================================================
       *
       * Sengaja undefined.
       *
       * Position akan datang dari Type 1/2/3/18/19.
       *
       * VesselCache akan melakukan merge berdasarkan MMSI.
       */
      lat: undefined,

      lon: undefined,

      sog: undefined,

      cog: undefined,

      hdg: undefined,

      utc: undefined,

      navStatus: undefined,

      /**
       * ========================================================
       * STATIC DATA
       * ========================================================
       *
       * Clean @ padding.
       */
      shipname: this.cleanAisText(decoded.shipname),

      callsign: this.cleanAisText(decoded.callsign),

      destination: this.cleanAisText(decoded.destination),

      imo: decoded.imo,

      shiptype: decoded.shiptype,

      length: decoded.length,

      width: decoded.width,
    };
  }

  /**
   * ============================================================
   * CLEAN AIS TEXT
   * ============================================================
   *
   * Contoh:
   *
   * CS@DEVELOPMENT@@@@@@
   * ↓
   * CS DEVELOPMENT
   *
   * SRIKANDI@BARUNA@RPPT
   * ↓
   * SRIKANDI BARUNA RPPT
   *
   * VWQWS@@
   * ↓
   * VWQWS
   *
   * OB@TARJUN
   * ↓
   * OB TARJUN
   */
  private cleanAisText(value?: string): string | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    const cleaned = value.replace(/@/g, ' ').replace(/\s+/g, ' ').trim();

    if (!cleaned) {
      return undefined;
    }

    return cleaned;
  }
}
