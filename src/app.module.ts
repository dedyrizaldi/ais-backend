import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { LoggerModule } from './logger/logger.module';

import { VesselModule } from './vessel/vessel.module';

import { AisModule } from './ais/ais.module';

import { NmeaModule } from './nmea/nmea.module';

import { TcpModule } from './tcp/tcp.module';

import { GatewayModule } from './gateway/gateway.module';

@Module({
  imports: [
    LoggerModule,

    VesselModule,

    AisModule,

    NmeaModule,

    TcpModule,

    GatewayModule,

    /**
     * ReceiverModule SEMENTARA DIMATIKAN
     *
     * Kita ingin memastikan apakah
     * traffic AIS yang membuat HTTP
     * server tidak merespons.
     */
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule {}
