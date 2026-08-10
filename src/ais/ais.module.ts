import { Module } from '@nestjs/common';

import { AisService } from './ais.service';

import { AisDecoderService } from './decoder/ais-decoder.service';
import { AisType5Decoder } from './decoder/ais-type5.decoder';

import { VesselModule } from '../vessel/vessel.module';
import { GatewayModule } from '../gateway/gateway.module';

import { LoggerModule } from '../logger/logger.module';

@Module({
  imports: [
    /**
     * Vessel
     */
    VesselModule,

    /**
     * WebSocket Gateway
     */
    GatewayModule,

    /**
     * Debug / Logger
     */
    LoggerModule,
  ],

  providers: [
    /**
     * AIS main service
     */
    AisService,

    /**
     * AIS decoder
     */
    AisDecoderService,

    /**
     * Custom AIS Type 5 decoder
     */
    AisType5Decoder,
  ],

  exports: [
    /**
     * Agar module lain bisa menggunakan
     * AisService.
     */
    AisService,

    /**
     * Agar module lain bisa menggunakan
     * AisDecoderService.
     */
    AisDecoderService,

    /**
     * Export Type 5 decoder jika
     * dibutuhkan module lain.
     */
    AisType5Decoder,
  ],
})
export class AisModule {}
