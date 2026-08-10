import {
  NmeaMessage,
  NmeaSentenceType,
} from './interfaces/nmea-message.interface';

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
   * PROCESS TCP CHUNK
   * ============================================================
   */
  process(
    receiverId: string,
    receiverName: string,
    chunk: string,
  ): NmeaMessage[] {
    /**
     * Ambil sisa buffer sebelumnya.
     */
    const previous = this.buffers.get(receiverId) ?? '';

    /**
     * Gabungkan dengan chunk baru.
     */
    const merged = previous + chunk;

    /**
     * Pecah berdasarkan line ending.
     *
     * Support:
     *
     * \n
     * \r\n
     */
    const lines = merged.split(/\r?\n/);

    /**
     * ========================================================
     * SIMPAN INCOMPLETE LINE
     * ========================================================
     *
     * TCP stream dapat memotong sentence:
     *
     * Chunk 1:
     * !AIVDM,1,1,,A,15Muq...
     *
     * Chunk 2:
     * ...,0*77\r\n
     *
     * Maka line terakhir harus disimpan
     * untuk chunk berikutnya.
     */
    const incomplete = lines.pop() ?? '';

    this.buffers.set(receiverId, incomplete);

    /**
     * ========================================================
     * BUILD NMEA MESSAGES
     * ========================================================
     */
    const messages: NmeaMessage[] = [];

    for (const raw of lines) {
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
       * Hilangkan NMEA Tag Block sebelum AIS sentence.
       */
      const normalized = this.normalizeSentence(sentence);

      /**
       * ======================================================
       * CREATE MESSAGE
       * ======================================================
       */
      messages.push({
        receiverId,

        receiverName,

        raw: normalized,

        type: this.detectType(normalized),
      });
    }

    return messages;
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
