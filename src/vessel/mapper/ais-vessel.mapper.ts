import { Injectable } from '@nestjs/common';

import { DecodedAisMessage } from '../../ais/interfaces/decoded-ais.interface';
import { Vessel } from '../interfaces/vessel.interface';

@Injectable()
export class AisVesselMapper {
  /**
   * ============================================================
   * MAP AIS MESSAGE -> VESSEL
   * ============================================================
   *
   * Mapper hanya bertugas mengubah:
   *
   * DecodedAisMessage
   *
   * menjadi:
   *
   * Vessel
   *
   * Mapper TIDAK melakukan merge.
   *
   * Merge dilakukan oleh:
   *
   * VesselCache
   */
  map(message: DecodedAisMessage): Vessel {
    return {
      /**
       * ========================================================
       * IDENTITY
       * ========================================================
       */
      mmsi: message.mmsi,

      /**
       * ========================================================
       * STATIC DATA
       * ========================================================
       *
       * Type 5 / Type 24.
       */
      name: this.cleanOptionalText(message.shipname),

      callsign: this.cleanOptionalText(message.callsign),

      imo: message.imo,

      destination: this.cleanOptionalText(message.destination),

      shipType: message.shiptype,

      /**
       * ========================================================
       * DYNAMIC POSITION
       * ========================================================
       *
       * Type 1/2/3/18/19.
       *
       * Type 5 tidak memiliki data ini,
       * sehingga nilainya boleh undefined.
       *
       * VesselCache akan mempertahankan
       * nilai sebelumnya.
       */
      lat: message.lat,

      lon: message.lon,

      sog: message.sog,

      cog: message.cog,

      hdg: message.hdg,

      navStatus: message.navStatus,

      /**
       * ========================================================
       * MESSAGE
       * ========================================================
       */
      messageType: message.messageType,

      /**
       * ========================================================
       * RECEIVER
       * ========================================================
       */
      receiverId: message.receiverId,

      receiverName: message.receiverName,

      /**
       * ========================================================
       * TIMESTAMP
       * ========================================================
       */
      updatedAt: new Date(),
    };
  }

  /**
   * ============================================================
   * CLEAN OPTIONAL TEXT
   * ============================================================
   *
   * Data dari decoder seharusnya sudah clean,
   * tetapi kita tetap melakukan defensive cleaning
   * di mapper.
   *
   * Contoh:
   *
   * "CS DEVELOPMENT   "
   *      ↓
   * "CS DEVELOPMENT"
   *
   * Tidak menghapus karakter valid di tengah.
   */
  private cleanOptionalText(value: string | undefined): string | undefined {
    if (value === undefined) {
      return undefined;
    }

    const cleaned = value.trim();

    if (!cleaned) {
      return undefined;
    }

    return cleaned;
  }
}
