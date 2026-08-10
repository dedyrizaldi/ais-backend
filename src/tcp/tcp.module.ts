import { Module } from '@nestjs/common';

import { TcpService } from './tcp.service';

import { ReceiverModule } from '../receiver/receiver.module';
import { NmeaModule } from '../nmea/nmea.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [ReceiverModule, NmeaModule, LoggerModule],

  providers: [TcpService],

  exports: [TcpService],
})
export class TcpModule {}
