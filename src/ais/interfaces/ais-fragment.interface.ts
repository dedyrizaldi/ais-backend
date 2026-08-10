export interface AisFragment {
  /**
   * Receiver ID
   */
  receiverId: string;

  /**
   * Receiver Name
   */
  receiverName: string;

  /**
   * Raw NMEA Sentence
   */
  raw: string;

  /**
   * Total fragment
   *
   * Contoh:
   * !AIVDM,2,1,...
   *
   * total = 2
   */
  total: number;

  /**
   * Fragment ke-
   */
  current: number;

  /**
   * Sequence ID
   *
   * Digunakan untuk menggabungkan multipart message.
   */
  sequenceId: string;

  /**
   * Radio Channel
   */
  channel: string;

  /**
   * Payload AIS
   */
  payload: string;

  /**
   * Fill Bits
   */
  fillBits: number;

  /**
   * NMEA Checksum
   *
   * Contoh:
   *
   * !AIVDM,...*5C
   *
   * checksum = "5C"
   */
  checksum: string;
}
