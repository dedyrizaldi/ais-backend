import {
  NmeaMessage,
  NmeaSentenceType,
} from './interfaces/nmea-message.interface';

export interface NmeaProcessStats {
  /**
   * Jumlah sentence yang berhasil diproses.
   */
  total: number;

  /**
   * Jumlah AIS sentence.
   */
  ais: number;

  /**
   * Jumlah GPS sentence.
   */
  gps: number;

  /**
   * Jumlah vendor sentence.
   */
  vendor: number;

  /**
   * Jumlah sentence yang tidak dikenali.
   */
  unknown: number;
}

export class NmeaProcessor {
  /**
   * ============================================================
   * BUFFER PER RECEIVER
   * ============================================================
   *
   * TCP merupakan stream.
   *
   * Satu chunk tidak selalu berisi satu sentence lengkap.
   */
  private readonly buffers = new Map<string, string>();

  /**
   * ============================================================
   * STATISTICS PER RECEIVER
   * ============================================================
   */
  private readonly statistics = new Map<string, NmeaProcessStats>();

  /**
   * ============================================================
   * PROCESS TCP CHUNK
   * ============================================================
   */
  process(
    receiverId: string,
    receiverName: string,
    chunk: string,
  ): NmeaMessage[] {
    /**
     * ========================================================
     * GET PREVIOUS BUFFER
     * ========================================================
     */
    const previous = this.buffers.get(receiverId) ?? '';

    /**
     * ========================================================
     * MERGE BUFFER + CHUNK
     * ========================================================
     */
    const merged = previous + chunk;

    /**
     * ========================================================
     * SPLIT LINES
     * ========================================================
     *
     * Support:
     *
     * \n
     * \r\n
     */
    const lines = merged.split(/\r?\n/);

    /**
     * ========================================================
     * SAVE INCOMPLETE LINE
     * ========================================================
     *
     * Line terakhir belum tentu lengkap.
     */
    const incomplete = lines.pop() ?? '';

    this.buffers.set(receiverId, incomplete);

    /**
     * ========================================================
     * GET STATISTICS
     * ========================================================
     */
    const stats = this.getOrCreateStats(receiverId);

    /**
     * ========================================================
     * BUILD NMEA MESSAGES
     * ========================================================
     */
    const messages: NmeaMessage[] = [];

    for (const raw of lines) {
      /**
       * ======================================================
       * NORMALIZE
       * ======================================================
       */
      const sentence = raw.trim();

      /**
       * Skip empty line.
       */
      if (!sentence) {
        continue;
      }

      /**
       * ======================================================
       * NORMALIZE SENTENCE
       * ======================================================
       *
       * Hilangkan NMEA Tag Block sebelum
       * AIS sentence.
       */
      const normalized = this.normalizeSentence(sentence);

      /**
       * ======================================================
       * DETECT TYPE
       * ======================================================
       */
      const type = this.detectType(normalized);

      /**
       * ======================================================
       * UPDATE STATISTICS
       * ======================================================
       */
      stats.total += 1;

      switch (type) {
        case NmeaSentenceType.AIS:
          stats.ais += 1;
          break;

        case NmeaSentenceType.GPS:
          stats.gps += 1;
          break;

        case NmeaSentenceType.VENDOR:
          stats.vendor += 1;
          break;

        case NmeaSentenceType.UNKNOWN:
        default:
          stats.unknown += 1;
          break;
      }

      /**
       * ======================================================
       * CREATE MESSAGE
       * ======================================================
       */
      messages.push({
        receiverId,

        receiverName,

        raw: normalized,

        type,
      });
    }

    return messages;
  }

  /**
   * ============================================================
   * GET OR CREATE STATISTICS
   * ============================================================
   */
  private getOrCreateStats(receiverId: string): NmeaProcessStats {
    const existing = this.statistics.get(receiverId);

    if (existing) {
      return existing;
    }

    const stats: NmeaProcessStats = {
      total: 0,

      ais: 0,

      gps: 0,

      vendor: 0,

      unknown: 0,
    };

    this.statistics.set(receiverId, stats);

    return stats;
  }

  /**
   * ============================================================
   * GET STATISTICS
   * ============================================================
   *
   * Mengambil statistik processing
   * berdasarkan receiver.
   */
  getStats(receiverId: string): NmeaProcessStats {
    const stats = this.statistics.get(receiverId);

    if (!stats) {
      return {
        total: 0,

        ais: 0,

        gps: 0,

        vendor: 0,

        unknown: 0,
      };
    }

    /**
     * Return copy agar caller
     * tidak dapat mengubah state internal.
     */
    return {
      ...stats,
    };
  }

  /**
   * ============================================================
   * GET ALL STATISTICS
   * ============================================================
   */
  getAllStats(): Map<string, NmeaProcessStats> {
    return new Map(
      Array.from(this.statistics.entries()).map(([receiverId, stats]) => [
        receiverId,
        {
          ...stats,
        },
      ]),
    );
  }

  /**
   * ============================================================
   * RESET STATISTICS
   * ============================================================
   */
  resetStats(receiverId: string): void {
    this.statistics.set(receiverId, {
      total: 0,

      ais: 0,

      gps: 0,

      vendor: 0,

      unknown: 0,
    });
  }

  /**
   * ============================================================
   * NORMALIZE SENTENCE
   * ============================================================
   *
   * AIS dapat menggunakan NMEA Tag Block.
   *
   * Contoh:
   *
   * \c:1785603231,sm:525111111*6D\!BSVDM,1,1,B,...
   *
   * menjadi:
   *
   * !BSVDM,1,1,B,...
   */
  private normalizeSentence(sentence: string): string {
    /**
     * ========================================================
     * AIS VDM / VDO
     * ========================================================
     *
     * Support:
     *
     * !AIVDM
     * !ABVDM
     * !BSVDM
     * !AIVDO
     * !ABVDO
     * !BSVDO
     */
    const aisMatch = sentence.match(/!(?:AI|AB|BS)VD[MO],.*$/);

    if (aisMatch) {
      return aisMatch[0];
    }

    /**
     * Bukan AIS.
     *
     * Kembalikan sentence asli.
     */
    return sentence;
  }

  /**
   * ============================================================
   * DETECT NMEA TYPE
   * ============================================================
   */
  private detectType(sentence: string): NmeaSentenceType {
    /**
     * ========================================================
     * AIS VDM / VDO
     * ========================================================
     */
    if (/!(?:AI|AB|BS)VD[MO],/.test(sentence)) {
      return NmeaSentenceType.AIS;
    }

    /**
     * ========================================================
     * GPS
     * ========================================================
     *
     * Support:
     *
     * $GP
     * $GN
     * $GB
     */
    if (
      sentence.startsWith('$GP') ||
      sentence.startsWith('$GN') ||
      sentence.startsWith('$GB')
    ) {
      return NmeaSentenceType.GPS;
    }

    /**
     * ========================================================
     * VENDOR
     * ========================================================
     */
    if (sentence.startsWith('$P')) {
      return NmeaSentenceType.VENDOR;
    }

    /**
     * ========================================================
     * UNKNOWN
     * ========================================================
     */
    return NmeaSentenceType.UNKNOWN;
  }
}
