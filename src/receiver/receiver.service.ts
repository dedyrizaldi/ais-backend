import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { ReceiverConnection, VtsConfig } from './interfaces/vts.interface';

@Injectable()
export class ReceiverService implements OnModuleInit {
  private readonly logger = new Logger(ReceiverService.name);

  private receivers: ReceiverConnection[] = [];

  private baseUrl = '';

  onModuleInit(): void {
    this.loadReceivers();
  }

  private loadReceivers(): void {
    const filePath = path.join(
      process.cwd(),
      'src',
      'receiver',
      'data',
      'vts.json',
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(`Receiver file not found : ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');

    const config = JSON.parse(raw) as VtsConfig;

    this.baseUrl = config.base_url;

    this.receivers = Object.entries(config.listVTS).map(([id, receiver]) => ({
      id,
      name: receiver.name,
      host: receiver.telnet.host,
      port: Number(receiver.telnet.port),
      parser:
        receiver.telnet.parser === 'BSVDM'
          ? 'BSVDM'
          : receiver.telnet.parser === 'AIVDM'
            ? 'AIVDM'
            : 'ABVDM',
    }));

    this.logger.log(`Loaded ${this.receivers.length} AIS receivers`);
  }

  findAll(): ReceiverConnection[] {
    return this.receivers;
  }

  findById(id: string): ReceiverConnection | undefined {
    return this.receivers.find((receiver) => receiver.id === id);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  reload(): void {
    this.loadReceivers();
  }
}
