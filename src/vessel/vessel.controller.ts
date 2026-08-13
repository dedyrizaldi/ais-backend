import { Controller, Delete, Get, Param, Query } from '@nestjs/common';

import { VesselService } from './vessel.service';

@Controller('vessels')
export class VesselController {
  constructor(private readonly vesselService: VesselService) {}

  /**
   * ============================================================
   * SEMUA VESSEL REALTIME
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
   * VESSEL DATABASE
   * ============================================================
   *
   * Pagination + Search.
   *
   * GET /vessels/database
   *
   * GET /vessels/database?page=1&limit=20
   *
   * GET /vessels/database?search=BUANA
   *
   * GET /vessels/database?search=525200997
   *
   * GET /vessels/database?search=YBDSPVT
   *
   * GET /vessels/database?search=BUANA&page=2&limit=20
   */
  @Get('database')
  findAllFromDatabase(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.vesselService.findAllFromDatabase(
      page ? Number(page) : 1,

      limit ? Number(limit) : 50,

      search,
    );
  }

  /**
   * ============================================================
   * TOTAL VESSEL REALTIME
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
   * VESSEL DALAM AREA PETA
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
    return this.vesselService.findByBounds(
      Number(north),
      Number(south),
      Number(east),
      Number(west),
    );
  }

  /**
   * ============================================================
   * CLEANUP CACHE
   * ============================================================
   *
   * GET /vessels/cleanup
   *
   * Contoh:
   *
   * /vessels/cleanup?timeout=15
   */
  @Get('cleanup')
  cleanup(@Query('timeout') timeout?: string) {
    const timeoutMinutes = timeout ? Number(timeout) : 15;

    const removed = this.vesselService.cleanup(timeoutMinutes);

    return {
      removed,

      total: this.vesselService.count(),
    };
  }

  /**
   * ============================================================
   * POSISI TERAKHIR VESSEL
   * ============================================================
   *
   * GET /vessels/:mmsi/position
   *
   * Contoh:
   *
   * /vessels/525200100/position
   */
  @Get(':mmsi/position')
  async latestPosition(@Param('mmsi') mmsi: string) {
    return this.vesselService.getLatestPosition(mmsi);
  }

  /**
   * ============================================================
   * HISTORI POSISI VESSEL
   * ============================================================
   *
   * GET /vessels/:mmsi/history
   *
   * Contoh:
   *
   * /vessels/525200100/history
   *
   * /vessels/525200100/history?page=1&limit=20
   */
  @Get(':mmsi/history')
  async positionHistory(
    @Param('mmsi') mmsi: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.vesselService.getPositionHistory(
      mmsi,

      page ? Number(page) : 1,

      limit ? Number(limit) : 50,
    );
  }

  /**
   * ============================================================
   * DETAIL VESSEL
   * ============================================================
   *
   * Prioritas:
   *
   * 1. Realtime cache
   * 2. PostgreSQL
   *
   * GET /vessels/:mmsi
   */
  @Get(':mmsi')
  async findOne(@Param('mmsi') mmsi: string) {
    return this.vesselService.findOne(mmsi);
  }

  /**
   * ============================================================
   * HAPUS VESSEL DARI CACHE
   * ============================================================
   *
   * Database TIDAK dihapus.
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
