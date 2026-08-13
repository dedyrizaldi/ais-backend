import { Module } from '@nestjs/common';

import { TcpService } from './tcp.service';
import { TcpController } from './tcp.controller';

import { ReceiverModule } from '../receiver/receiver.module';
import { NmeaModule } from '../nmea/nmea.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [ReceiverModule, NmeaModule, LoggerModule],

  controllers: [TcpController],

  providers: [TcpService],

  exports: [TcpService],
})
export class TcpModule {}
