import { Injectable } from '@nestjs/common';

export interface AisType5Decoded {
  messageType: number;

  repeatIndicator: number;

  mmsi: string;

  aisVersion: number;

  imo: number;

  callsign: string;

  shipname: string;

  shiptype: number;

  dimension: {
    a: number;
    b: number;
    c: number;
    d: number;
  };

  length: number;

  width: number;

  positionFixingDevice: number;

  eta: {
    month: number;
    day: number;
    hour: number;
    minute: number;
  };

  draught: number;

  destination: string;

  dte: number;

  spare: number;
}

@Injectable()
export class AisType5Decoder {
  /**
   * ============================================================
   * AIS ARMORING
   * ============================================================
   */
  private aisCharToValue(character: string): number {
    if (character.length !== 1) {
      throw new Error(`Invalid AIS character: ${character}`);
    }

    const code = character.charCodeAt(0);

    let value = code - 48;

    if (value > 40) {
      value -= 8;
    }

    if (value < 0 || value > 63) {
      throw new Error(`Invalid AIS armored character: ${character}`);
    }

    return value;
  }

  /**
   * ============================================================
   * PAYLOAD -> BITS
   * ============================================================
   */
  private payloadToBits(payload: string): string {
    let bits = '';

    for (const character of payload) {
      const value = this.aisCharToValue(character);

      bits += value.toString(2).padStart(6, '0');
    }

    return bits;
  }

  /**
   * ============================================================
   * READ UNSIGNED INTEGER
   * ============================================================
   */
  private readUInt(bits: string, start: number, length: number): number {
    const end = start + length;

    if (start < 0 || end > bits.length) {
      throw new Error(
        [
          'AIS bit overflow:',
          `start=${start}`,
          `length=${length}`,
          `total=${bits.length}`,
        ].join(' '),
      );
    }

    return parseInt(bits.substring(start, end), 2);
  }

  /**
   * ============================================================
   * DECODE AIS 6-BIT CHARACTER
   * ============================================================
   */
  private decodeSixBitCharacter(value: number): string {
    if (value < 0 || value > 63) {
      return '';
    }

    if (value < 32) {
      return String.fromCharCode(value + 64);
    }

    return String.fromCharCode(value + 32);
  }

  /**
   * ============================================================
   * READ AIS 6-BIT STRING
   * ============================================================
   */
  private readSixBitString(
    bits: string,
    start: number,
    characterCount: number,
  ): string {
    let result = '';

    for (let i = 0; i < characterCount; i++) {
      const value = this.readUInt(bits, start + i * 6, 6);

      result += this.decodeSixBitCharacter(value);
    }

    return result;
  }

  /**
   * ============================================================
   * CLEAN AIS TEXT
   * ============================================================
   *
   * Contoh:
   *
   * CS@DEVELOPMENT@@@@@@
   *        ↓
   * CS DEVELOPMENT
   *
   * SRIKANDI@BARUNA@RPPT
   *        ↓
   * SRIKANDI BARUNA RPPT
   *
   * OB@TARJUN
   *        ↓
   * OB TARJUN
   *
   * @ di AIS merupakan padding/character separator.
   *
   * Kita:
   *
   * 1. Hapus @ di bagian akhir.
   * 2. Ganti @ di tengah dengan spasi.
   * 3. Rapikan multiple spaces.
   * 4. Trim whitespace.
   */
  private cleanAisText(value: string): string {
    return value
      .replace(/@+$/g, '')
      .replace(/@/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * ============================================================
   * DECODE AIS TYPE 5
   * ============================================================
   *
   * AIS Message Type 5:
   *
   * 424 bits
   */
  decode(payload: string, fillBits = 0): AisType5Decoded | null {
    try {
      /**
       * ========================================================
       * VALIDATE PAYLOAD
       * ========================================================
       */
      if (!payload) {
        return null;
      }

      /**
       * ========================================================
       * PAYLOAD -> BITS
       * ========================================================
       */
      let bits = this.payloadToBits(payload);

      /**
       * ========================================================
       * REMOVE FILL BITS
       * ========================================================
       */
      if (fillBits > 0) {
        if (fillBits >= bits.length) {
          return null;
        }

        bits = bits.substring(0, bits.length - fillBits);
      }

      /**
       * ========================================================
       * TYPE 5 = 424 BITS
       * ========================================================
       */
      if (bits.length !== 424) {
        throw new Error(
          [
            'Invalid AIS Type 5 bit length.',
            `Expected=424`,
            `Actual=${bits.length}`,
          ].join(' '),
        );
      }

      /**
       * ========================================================
       * MESSAGE TYPE
       * ========================================================
       *
       * Bit 0-5
       */
      const messageType = this.readUInt(bits, 0, 6);

      if (messageType !== 5) {
        return null;
      }

      /**
       * ========================================================
       * REPEAT INDICATOR
       * ========================================================
       *
       * Bit 6-7
       */
      const repeatIndicator = this.readUInt(bits, 6, 2);

      /**
       * ========================================================
       * MMSI
       * ========================================================
       *
       * Bit 8-37
       */
      const mmsi = String(this.readUInt(bits, 8, 30));

      /**
       * ========================================================
       * AIS VERSION
       * ========================================================
       *
       * Bit 38-39
       */
      const aisVersion = this.readUInt(bits, 38, 2);

      /**
       * ========================================================
       * IMO
       * ========================================================
       *
       * Bit 40-69
       */
      const imo = this.readUInt(bits, 40, 30);

      /**
       * ========================================================
       * CALL SIGN
       * ========================================================
       *
       * Bit 70-111
       *
       * 7 characters × 6 bit
       */
      const callsign = this.cleanAisText(this.readSixBitString(bits, 70, 7));

      /**
       * ========================================================
       * SHIP NAME
       * ========================================================
       *
       * Bit 112-231
       *
       * 20 characters × 6 bit
       */
      const shipname = this.cleanAisText(this.readSixBitString(bits, 112, 20));

      /**
       * ========================================================
       * SHIP TYPE
       * ========================================================
       *
       * Bit 232-239
       */
      const shiptype = this.readUInt(bits, 232, 8);

      /**
       * ========================================================
       * DIMENSION A
       * ========================================================
       *
       * Bit 240-248
       */
      const a = this.readUInt(bits, 240, 9);

      /**
       * ========================================================
       * DIMENSION B
       * ========================================================
       *
       * Bit 249-257
       */
      const b = this.readUInt(bits, 249, 9);

      /**
       * ========================================================
       * DIMENSION C
       * ========================================================
       *
       * Bit 258-263
       */
      const c = this.readUInt(bits, 258, 6);

      /**
       * ========================================================
       * DIMENSION D
       * ========================================================
       *
       * Bit 264-269
       */
      const d = this.readUInt(bits, 264, 6);

      /**
       * ========================================================
       * POSITION FIXING DEVICE
       * ========================================================
       *
       * Bit 270-273
       */
      const positionFixingDevice = this.readUInt(bits, 270, 4);

      /**
       * ========================================================
       * ETA
       * ========================================================
       *
       * Month  = 4 bit
       * Day    = 5 bit
       * Hour   = 5 bit
       * Minute = 6 bit
       */
      const etaMonth = this.readUInt(bits, 274, 4);

      const etaDay = this.readUInt(bits, 278, 5);

      const etaHour = this.readUInt(bits, 283, 5);

      const etaMinute = this.readUInt(bits, 288, 6);

      /**
       * ========================================================
       * DRAUGHT
       * ========================================================
       *
       * Bit 294-301
       *
       * Unit = 0.1 meter
       */
      const draughtRaw = this.readUInt(bits, 294, 8);

      const draught = draughtRaw / 10;

      /**
       * ========================================================
       * DESTINATION
       * ========================================================
       *
       * Bit 302-421
       *
       * 20 characters × 6 bit
       */
      const destination = this.cleanAisText(
        this.readSixBitString(bits, 302, 20),
      );

      /**
       * ========================================================
       * DTE
       * ========================================================
       *
       * Bit 422
       */
      const dte = this.readUInt(bits, 422, 1);

      /**
       * ========================================================
       * SPARE
       * ========================================================
       *
       * Bit 423
       */
      const spare = this.readUInt(bits, 423, 1);

      /**
       * ========================================================
       * RETURN
       * ========================================================
       */
      return {
        messageType,

        repeatIndicator,

        mmsi,

        aisVersion,

        imo,

        callsign,

        shipname,

        shiptype,

        dimension: {
          a,
          b,
          c,
          d,
        },

        length: a + b,

        width: c + d,

        positionFixingDevice,

        eta: {
          month: etaMonth,

          day: etaDay,

          hour: etaHour,

          minute: etaMinute,
        },

        draught,

        destination,

        dte,

        spare,
      };
    } catch {
      return null;
    }
  }
}
