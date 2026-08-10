import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { LoggerService } from '../../logger/logger.service';
import { VesselService } from '../vessel.service';

@Injectable()
export class VesselScheduler {
  constructor(
    private readonly vesselService: VesselService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * ============================================================
   * CLEANUP INACTIVE VESSELS
   * ============================================================
   *
   * Cleanup dijalankan setiap 1 menit.
   *
   * Vessel dianggap inactive apabila
   * tidak menerima update selama 15 menit.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  cleanup(): void {
    const removed = this.vesselService.cleanup(15);

    /**
     * Jangan melakukan log setiap menit
     * apabila tidak ada vessel yang dihapus.
     */
    if (removed <= 0) {
      return;
    }

    this.logger.app(
      `Cleanup ${removed} inactive vessel(s). Remaining: ${this.vesselService.count()}`,
    );
  }
}
