import { AisFragment } from '../interfaces/ais-fragment.interface';

export class AisParser {
  /**
   * ============================================================
   * AIS PREFIXES
   * ============================================================
   *
   * Prefix AIS yang didukung.
   */
  private static readonly PREFIXES = [
    '!AIVDM',
    '!AIVDO',
    '!ABVDM',
    '!ABVDO',
    '!BSVDM',
    '!BSVDO',
  ];

  /**
   * ============================================================
   * PARSE AIS SENTENCE
   * ============================================================
   *
   * Mengubah satu AIS NMEA sentence menjadi AisFragment.
   */
  parse(
    receiverId: string,
    receiverName: string,
    sentence: string,
  ): AisFragment | null {
    /**
     * ========================================================
     * EMPTY INPUT
     * ========================================================
     */
    if (!sentence) {
      return null;
    }

    /**
     * ========================================================
     * NORMALIZE LINE
     * ========================================================
     */
    let line = sentence.trim();

    if (!line) {
      return null;
    }

    /**
     * ========================================================
     * REMOVE RECEIVER METADATA
     * ========================================================
     *
     * Beberapa receiver dapat mengirim metadata sebelum
     * AIS sentence.
     *
     * Contoh:
     *
     * \c:1785601813*5F\!ABVDM,...
     *
     * Kita mulai parsing dari karakter '!'.
     */
    const start = line.indexOf('!');

    if (start < 0) {
      return null;
    }

    line = line.substring(start).trim();

    /**
     * ========================================================
     * VALIDATE PREFIX
     * ========================================================
     */
    const validPrefix = AisParser.PREFIXES.some((prefix) =>
      line.startsWith(prefix),
    );

    if (!validPrefix) {
      return null;
    }

    /**
     * ========================================================
     * NMEA FORMAT
     * ========================================================
     *
     * !AIVDM,total,current,sequence,channel,payload,fillbits*checksum
     *
     * Contoh:
     *
     * !AIVDM,1,1,,A,15Muq@001o...,0*77
     *
     * Multipart:
     *
     * !AIVDM,2,1,8,B,57mF...,0*77
     * !AIVDM,2,2,8,B,000000...,2*2F
     */
    const fields = line.split(',');

    /**
     * Minimal:
     *
     * 0 !AIVDM
     * 1 total
     * 2 current
     * 3 sequence
     * 4 channel
     * 5 payload
     * 6 fillbits/checksum
     */
    if (fields.length < 7) {
      return null;
    }

    /**
     * ========================================================
     * BASIC FIELDS
     * ========================================================
     */
    const total = Number.parseInt(fields[1] ?? '', 10);

    const current = Number.parseInt(fields[2] ?? '', 10);

    const sequenceId = (fields[3] ?? '').trim();

    const channel = (fields[4] ?? '').trim();

    const payload = (fields[5] ?? '').trim();

    const checksumField = (fields[6] ?? '').trim();

    /**
     * ========================================================
     * CHECKSUM / FILL BITS
     * ========================================================
     *
     * Field terakhir biasanya:
     *
     * 0*77
     *
     * atau:
     *
     * 2*2F
     */
    const checksumIndex = checksumField.indexOf('*');

    let fillBits = 0;
    let checksum = '';

    if (checksumIndex >= 0) {
      const fillBitsValue = checksumField.substring(0, checksumIndex);

      checksum = checksumField.substring(checksumIndex + 1).trim();

      fillBits = Number.parseInt(fillBitsValue, 10);
    } else {
      /**
       * Tidak ada checksum.
       *
       * Tetap coba membaca fill bits.
       */
      fillBits = Number.parseInt(checksumField, 10);
    }

    /**
     * ========================================================
     * VALIDATE TOTAL
     * ========================================================
     */
    if (!Number.isInteger(total) || total < 1) {
      return null;
    }

    /**
     * ========================================================
     * VALIDATE CURRENT
     * ========================================================
     */
    if (!Number.isInteger(current) || current < 1) {
      return null;
    }

    if (current > total) {
      return null;
    }

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
     * SEQUENCE ID
     * ========================================================
     *
     * PENTING:
     *
     * Multipart AIS TIDAK selalu memiliki sequence ID.
     *
     * Contoh valid:
     *
     * !AIVDM,2,1,,A,...
     * !AIVDM,2,2,,A,...
     *
     * Karena AisFragmentAssembler sudah menangani:
     *
     * sequenceId || '-'
     *
     * maka parser TIDAK BOLEH reject multipart
     * hanya karena sequenceId kosong.
     */
    const normalizedSequenceId = sequenceId || '';

    /**
     * ========================================================
     * VALIDATE FILL BITS
     * ========================================================
     *
     * AIS fill bits valid:
     *
     * 0 - 5
     */
    if (!Number.isInteger(fillBits) || fillBits < 0 || fillBits > 5) {
      return null;
    }

    /**
     * ========================================================
     * BUILD FRAGMENT
     * ========================================================
     */
    const fragment: AisFragment = {
      receiverId,

      receiverName,

      raw: line,

      total,

      current,

      sequenceId: normalizedSequenceId,

      channel,

      payload,

      fillBits,

      checksum,
    };

    /**
     * ========================================================
     * RETURN
     * ========================================================
     */
    return fragment;
  }
}
