import { Controller, Delete, Get, Param, Query } from '@nestjs/common';

import { VesselService } from './vessel.service';

@Controller('vessels')
export class VesselController {
  constructor(private readonly vesselService: VesselService) {}

  /**
   * ============================================================
   * GET ALL VESSELS
   * ============================================================
   *
   * GET /vessels
   */
  @Get()
  findAll() {
    return this.vesselService.findAll();
  }

  /**
   * ============================================================
   * GET VESSEL COUNT
   * ============================================================
   *
   * GET /vessels/count
   */
  @Get('count')
  count() {
    return {
      total: this.vesselService.count(),
    };
  }

  /**
   * ============================================================
   * GET VESSELS BY MAP BOUNDS
   * ============================================================
   *
   * GET /vessels/map
   *
   * Contoh:
   *
   * /vessels/map
   * ?north=-5.8
   * &south=-6.6
   * &east=107.2
   * &west=106.4
   */
  @Get('map')
  map(
    @Query('north') north: string,
    @Query('south') south: string,
    @Query('east') east: string,
    @Query('west') west: string,
  ) {
    const northValue = Number(north);

    const southValue = Number(south);

    const eastValue = Number(east);

    const westValue = Number(west);

    /**
     * Pastikan semua parameter
     * merupakan angka valid.
     */
    if (
      !Number.isFinite(northValue) ||
      !Number.isFinite(southValue) ||
      !Number.isFinite(eastValue) ||
      !Number.isFinite(westValue)
    ) {
      return [];
    }

    return this.vesselService.findByBounds(
      northValue,
      southValue,
      eastValue,
      westValue,
    );
  }

  /**
   * ============================================================
   * CLEANUP
   * ============================================================
   *
   * GET /vessels/cleanup
   *
   * Contoh:
   *
   * /vessels/cleanup
   *
   * /vessels/cleanup?timeout=15
   */
  @Get('cleanup')
  cleanup(@Query('timeout') timeout?: string) {
    const timeoutValue = timeout !== undefined ? Number(timeout) : 15;

    /**
     * Kalau timeout tidak valid,
     * gunakan default 15 menit.
     */
    const timeoutMinutes =
      Number.isFinite(timeoutValue) && timeoutValue > 0 ? timeoutValue : 15;

    const removed = this.vesselService.cleanup(timeoutMinutes);

    return {
      removed,
      total: this.vesselService.count(),
    };
  }

  /**
   * ============================================================
   * GET VESSEL DETAIL
   * ============================================================
   *
   * GET /vessels/:mmsi
   */
  @Get(':mmsi')
  findOne(@Param('mmsi') mmsi: string) {
    return this.vesselService.findOne(mmsi);
  }

  /**
   * ============================================================
   * DELETE VESSEL
   * ============================================================
   *
   * DELETE /vessels/:mmsi
   */
  @Delete(':mmsi')
  remove(@Param('mmsi') mmsi: string) {
    return {
      success: this.vesselService.remove(mmsi),
    };
  }
}
