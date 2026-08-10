import { Injectable } from '@nestjs/common';

import { DecodedAisMessage } from '../ais/interfaces/decoded-ais.interface';

import { Vessel } from './interfaces/vessel.interface';
import { VesselCache } from './cache/vessel.cache';
import { AisVesselMapper } from './mapper/ais-vessel.mapper';

@Injectable()
export class VesselService {
  /**
   * ============================================================
   * VESSEL CACHE
   * ============================================================
   *
   * Semua vessel disimpan berdasarkan MMSI.
   */
  private readonly cache = new VesselCache();

  constructor(private readonly mapper: AisVesselMapper) {}

  /**
   * ============================================================
   * UPDATE VESSEL
   * ============================================================
   *
   * AIS Message:
   *
   * Type 1
   * Type 2
   * Type 3
   * Type 18
   * Type 19
   *     ↓
   * Dynamic Position
   *
   * Type 5
   * Type 24
   *     ↓
   * Static / Voyage Data
   */
  update(message: DecodedAisMessage): Vessel {
    /**
     * Convert decoded AIS message
     * menjadi Vessel object.
     */
    const vessel = this.mapper.map(message);

    /**
     * ========================================================
     * DYNAMIC POSITION
     * ========================================================
     */
    switch (message.messageType) {
      case 1:
      case 2:
      case 3:
      case 18:
      case 19:
        return this.cache.updatePosition(vessel);

      /**
       * ======================================================
       * STATIC / VOYAGE DATA
       * ======================================================
       *
       * Type 5:
       * Static and Voyage Related Data
       *
       * Type 24:
       * Static Data Report
       */
      case 5:
      case 24:
        return this.cache.updateStatic(vessel);

      /**
       * ======================================================
       * OTHER MESSAGE TYPES
       * ======================================================
       */
      default:
        return this.cache.set(vessel);
    }
  }

  /**
   * ============================================================
   * FIND ONE
   * ============================================================
   */
  findOne(mmsi: string): Vessel | undefined {
    return this.cache.get(mmsi);
  }

  /**
   * ============================================================
   * FIND ALL
   * ============================================================
   */
  findAll(): Vessel[] {
    return this.cache.getAll();
  }

  /**
   * ============================================================
   * FIND BY BOUNDS
   * ============================================================
   *
   * Mengambil vessel yang berada
   * di dalam bounding box.
   */
  findByBounds(
    north: number,
    south: number,
    east: number,
    west: number,
  ): Vessel[] {
    return this.cache.values().filter((vessel) => {
      /**
       * Vessel tanpa posisi
       * tidak bisa ditampilkan
       * pada bounding box.
       */
      if (vessel.lat === undefined || vessel.lon === undefined) {
        return false;
      }

      return (
        vessel.lat <= north &&
        vessel.lat >= south &&
        vessel.lon <= east &&
        vessel.lon >= west
      );
    });
  }

  /**
   * ============================================================
   * VALUES
   * ============================================================
   *
   * Digunakan untuk streaming,
   * websocket atau internal service.
   */
  values(): Vessel[] {
    return this.cache.values();
  }

  /**
   * ============================================================
   * CLEANUP
   * ============================================================
   *
   * Default timeout:
   * 15 menit.
   */
  cleanup(timeoutMinutes = 15): number {
    return this.cache.cleanup(timeoutMinutes);
  }

  /**
   * ============================================================
   * REMOVE
   * ============================================================
   */
  remove(mmsi: string): boolean {
    return this.cache.remove(mmsi);
  }

  /**
   * ============================================================
   * CLEAR
   * ============================================================
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * ============================================================
   * COUNT
   * ============================================================
   */
  count(): number {
    return this.cache.size();
  }

  /**
   * ============================================================
   * EXISTS
   * ============================================================
   */
  exists(mmsi: string): boolean {
    return this.cache.has(mmsi);
  }
}
