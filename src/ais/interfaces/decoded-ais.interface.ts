export interface DecodedAisMessage {
  receiverId: string;

  receiverName: string;

  raw: string;

  messageType: number;

  mmsi: string;

  valid: boolean;

  channel: string;

  vesselClass: string;

  lat?: number;

  lon?: number;

  sog?: number;

  cog?: number;

  hdg?: number;

  navStatus?: number;

  utc?: number;

  shipname?: string;

  callsign?: string;

  imo?: number;

  destination?: string;

  shiptype?: number;

  length?: number;

  width?: number;
}
