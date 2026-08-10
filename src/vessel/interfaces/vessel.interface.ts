export interface Vessel {
  /**
   * ============================================================
   * MMSI
   * ============================================================
   */
  mmsi: string;

  /**
   * ============================================================
   * STATIC DATA
   * ============================================================
   */

  /**
   * Ship Name
   */
  name?: string;

  /**
   * Call Sign
   */
  callsign?: string;

  /**
   * IMO Number
   */
  imo?: number;

  /**
   * Destination
   */
  destination?: string;

  /**
   * Ship Type
   */
  shipType?: number;

  /**
   * ============================================================
   * DYNAMIC POSITION
   * ============================================================
   */

  /**
   * Latitude
   */
  lat?: number;

  /**
   * Longitude
   */
  lon?: number;

  /**
   * Speed Over Ground
   */
  sog?: number;

  /**
   * Course Over Ground
   */
  cog?: number;

  /**
   * Heading
   */
  hdg?: number;

  /**
   * Navigation Status
   */
  navStatus?: number;

  /**
   * ============================================================
   * AIS MESSAGE
   * ============================================================
   */
  messageType?: number;

  /**
   * ============================================================
   * RECEIVER
   * ============================================================
   */
  receiverId?: string;

  receiverName?: string;

  /**
   * ============================================================
   * LAST UPDATE
   * ============================================================
   */
  updatedAt: Date;
}
