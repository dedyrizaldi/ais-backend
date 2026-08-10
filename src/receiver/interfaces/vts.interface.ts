export interface VtsTelnet {
  name?: string;
  host: string;
  port: string | number;
  parser: string;
}

export interface VtsReceiver {
  name: string;
  telnet: VtsTelnet;
}

export interface VtsConfig {
  base_url: string;
  listVTS: Record<string, VtsReceiver>;
}

export interface ReceiverConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  parser: 'ABVDM' | 'BSVDM' | 'AIVDM';
}
