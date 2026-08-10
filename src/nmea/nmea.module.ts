import { Module } from '@nestjs/common';

import { NmeaService } from './nmea.service';

import { AisModule } from '../ais/ais.module';
import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [
    /**
     * LoggerService
     */
    LoggerModule,

    /**
     * AisService
     */
    AisModule,
  ],

  providers: [NmeaService],

  exports: [NmeaService],
})
export class NmeaModule {}
