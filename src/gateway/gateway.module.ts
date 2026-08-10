import { Module } from '@nestjs/common';

import { LoggerModule } from '../logger/logger.module';

import { AisGateway } from './ais.gateway';

@Module({
  imports: [LoggerModule],

  providers: [AisGateway],

  exports: [AisGateway],
})
export class GatewayModule {}
