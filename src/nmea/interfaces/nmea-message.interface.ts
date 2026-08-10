export enum NmeaSentenceType {
  AIS = 'AIS',
  GPS = 'GPS',
  SENSOR = 'SENSOR',
  VENDOR = 'VENDOR',
  UNKNOWN = 'UNKNOWN',
}

export interface NmeaMessage {
  receiverId: string;

  receiverName: string;

  raw: string;

  type: NmeaSentenceType;
}
