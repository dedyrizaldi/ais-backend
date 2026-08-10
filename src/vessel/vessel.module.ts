import { Module } from '@nestjs/common';

import { LoggerModule } from '../logger/logger.module';

import { VesselController } from './vessel.controller';
import { VesselService } from './vessel.service';
import { AisVesselMapper } from './mapper/ais-vessel.mapper';
import { VesselScheduler } from './scheduler/vessel.scheduler';

@Module({
  imports: [LoggerModule],

  controllers: [VesselController],

  providers: [VesselService, AisVesselMapper, VesselScheduler],

  exports: [VesselService],
})
export class VesselModule {}
