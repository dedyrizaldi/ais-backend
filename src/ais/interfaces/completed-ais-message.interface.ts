export interface CompletedAisMessage {
  /**
   * Receiver ID
   */
  receiverId: string;

  /**
   * Receiver Name
   */
  receiverName: string;

  /**
   * Raw NMEA sentence.
   *
   * Untuk multipart, berisi seluruh sentence asli:
   *
   * !AIVDM,2,1,...
   * !AIVDM,2,2,...
   *
   * Dipakai oleh AisDecoderService.
   */
  raw: string;

  /**
   * AIS Channel
   */
  channel: string;

  /**
   * Payload yang sudah digabung.
   *
   * Digunakan untuk debugging / inspection.
   *
   * Jangan digunakan sebagai pengganti raw
   * ketika dikirim ke AisDecode.
   */
  payload: string;

  /**
   * Fill Bits dari fragment terakhir.
   */
  fillBits: number;

  /**
   * Jumlah fragment.
   *
   * 1 = single sentence
   * 2 = multipart 2 fragment
   * dst.
   */
  total: number;
}
