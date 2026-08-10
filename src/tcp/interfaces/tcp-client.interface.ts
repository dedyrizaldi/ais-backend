export type ParserType = 'ABVDM' | 'AIVDM' | 'BSVDM';

export interface ConnectionOptions {
  id: string;
  name: string;
  host: string;
  port: number;
  parser: ParserType;
}

export interface TcpClientEvents {
  connected?: (receiver: ConnectionOptions) => void;

  disconnected?: (receiver: ConnectionOptions) => void;

  data?: (receiver: ConnectionOptions, data: string) => void;

  error?: (receiver: ConnectionOptions, error: Error) => void;
}
