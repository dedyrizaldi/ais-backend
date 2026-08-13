import { Injectable } from '@nestjs/common';

import { DecodedAisMessage } from '../ais/interfaces/decoded-ais.interface';
import { PrismaService } from '../database/prisma.service';

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
   * Cache digunakan sebagai sumber data realtime AIS.
   */
  private readonly cache = new VesselCache();

  /**
   * ============================================================
   * POSITION DATABASE THROTTLE
   * ============================================================
   *
   * Maksimal 1 posisi disimpan ke database
   * setiap 15 detik untuk setiap vessel.
   */
  private readonly POSITION_SAVE_INTERVAL_MS = 15_000;

  /**
   * ============================================================
   * STATIC DATABASE THROTTLE
   * ============================================================
   *
   * Type 5 / Type 24 dapat datang berulang.
   *
   * Database maksimal diproses 1 kali
   * setiap 60 detik untuk setiap vessel.
   */
  private readonly STATIC_SAVE_INTERVAL_MS = 60_000;

  /**
   * ============================================================
   * LAST POSITION SAVED
   * ============================================================
   *
   * Timestamp terakhir position disimpan
   * ke database berdasarkan MMSI.
   */
  private readonly lastPositionSaved = new Map<string, number>();

  /**
   * ============================================================
   * LAST STATIC SAVED
   * ============================================================
   *
   * Timestamp terakhir static data diproses
   * ke database berdasarkan MMSI.
   */
  private readonly lastStaticSaved = new Map<string, number>();

  constructor(
    private readonly mapper: AisVesselMapper,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * ============================================================
   * UPDATE VESSEL
   * ============================================================
   *
   * Semua decoded AIS message masuk melalui method ini.
   */
  update(message: DecodedAisMessage): Vessel {
    const vessel = this.mapper.map(message);

    let result: Vessel;

    switch (message.messageType) {
      /**
       * ======================================================
       * DYNAMIC POSITION
       * ======================================================
       *
       * Type 1
       * Type 2
       * Type 3
       * Type 18
       * Type 19
       */
      case 1:
      case 2:
      case 3:
      case 18:
      case 19:
        result = this.cache.updatePosition(vessel);

        this.queuePositionSave(result, message.receiverId);

        break;

      /**
       * ======================================================
       * STATIC / VOYAGE DATA
       * ======================================================
       *
       * Type 5
       * Type 24
       */
      case 5:
      case 24:
        result = this.cache.updateStatic(vessel);

        this.queueStaticSave(result);

        break;

      /**
       * ======================================================
       * OTHER MESSAGE
       * ======================================================
       */
      default:
        result = this.cache.set(vessel);

        this.queueStaticSave(result);

        break;
    }

    /**
     * Jangan menunggu database.
     *
     * Realtime AIS tetap berjalan
     * melalui cache.
     */
    return result;
  }

  /**
   * ============================================================
   * QUEUE STATIC SAVE
   * ============================================================
   */
  private queueStaticSave(vessel: Vessel): void {
    const now = Date.now();

    const lastSaved = this.lastStaticSaved.get(vessel.mmsi);

    if (
      lastSaved !== undefined &&
      now - lastSaved < this.STATIC_SAVE_INTERVAL_MS
    ) {
      return;
    }

    this.lastStaticSaved.set(vessel.mmsi, now);

    void this.persistVessel(vessel);
  }

  /**
   * ============================================================
   * QUEUE POSITION SAVE
   * ============================================================
   */
  private queuePositionSave(vessel: Vessel, receiverId?: string): void {
    /**
     * Position wajib lengkap.
     */
    if (vessel.lat === undefined || vessel.lon === undefined) {
      return;
    }

    /**
     * Receiver wajib tersedia.
     */
    if (!receiverId) {
      return;
    }

    const now = Date.now();

    const lastSaved = this.lastPositionSaved.get(vessel.mmsi);

    if (
      lastSaved !== undefined &&
      now - lastSaved < this.POSITION_SAVE_INTERVAL_MS
    ) {
      return;
    }

    this.lastPositionSaved.set(vessel.mmsi, now);

    void this.persistPosition(vessel, receiverId);
  }

  /**
   * ============================================================
   * PERSIST VESSEL
   * ============================================================
   */
  private async persistVessel(vessel: Vessel): Promise<void> {
    try {
      const existing = await this.prisma.vessel.findUnique({
        where: {
          mmsi: vessel.mmsi,
        },

        select: {
          name: true,
          callsign: true,
          imo: true,
          shipType: true,
          destination: true,
        },
      });

      /**
       * ======================================================
       * CREATE
       * ======================================================
       */
      if (!existing) {
        await this.prisma.vessel.create({
          data: {
            mmsi: vessel.mmsi,

            name: vessel.name,

            callsign: vessel.callsign,

            imo: vessel.imo,

            shipType: vessel.shipType,

            destination: vessel.destination,
          },
        });

        return;
      }

      /**
       * ======================================================
       * BUILD UPDATE DATA
       * ======================================================
       */
      const updateData: {
        name?: string;
        callsign?: string;
        imo?: number;
        shipType?: number;
        destination?: string;
      } = {};

      /**
       * NAME
       */
      if (vessel.name && vessel.name !== existing.name) {
        updateData.name = vessel.name;
      }

      /**
       * CALLSIGN
       */
      if (vessel.callsign && vessel.callsign !== existing.callsign) {
        updateData.callsign = vessel.callsign;
      }

      /**
       * IMO
       */
      if (vessel.imo !== undefined && vessel.imo !== existing.imo) {
        updateData.imo = vessel.imo;
      }

      /**
       * SHIP TYPE
       */
      if (
        vessel.shipType !== undefined &&
        vessel.shipType !== existing.shipType
      ) {
        updateData.shipType = vessel.shipType;
      }

      /**
       * DESTINATION
       */
      if (vessel.destination && vessel.destination !== existing.destination) {
        updateData.destination = vessel.destination;
      }

      /**
       * Tidak ada perubahan.
       */
      if (Object.keys(updateData).length === 0) {
        return;
      }

      /**
       * ======================================================
       * UPDATE
       * ======================================================
       */
      await this.prisma.vessel.update({
        where: {
          mmsi: vessel.mmsi,
        },

        data: updateData,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(`[DATABASE][VESSEL] ${vessel.mmsi}: ${error.message}`);
      } else {
        console.error(`[DATABASE][VESSEL] ${vessel.mmsi}: database error`);
      }
    }
  }

  /**
   * ============================================================
   * PERSIST POSITION
   * ============================================================
   */
  private async persistPosition(
    vessel: Vessel,
    receiverId: string,
  ): Promise<void> {
    try {
      /**
       * ======================================================
       * PASTIKAN VESSEL ADA
       * ======================================================
       */
      await this.prisma.vessel.upsert({
        where: {
          mmsi: vessel.mmsi,
        },

        create: {
          mmsi: vessel.mmsi,

          name: vessel.name,

          callsign: vessel.callsign,

          imo: vessel.imo,

          shipType: vessel.shipType,

          destination: vessel.destination,
        },

        update: {},
      });

      /**
       * ======================================================
       * INSERT POSITION
       * ======================================================
       */
      await this.prisma.vesselPosition.create({
        data: {
          vessel: {
            connect: {
              mmsi: vessel.mmsi,
            },
          },

          receiver: {
            connect: {
              id: receiverId,
            },
          },

          latitude: vessel.lat!,

          longitude: vessel.lon!,

          sog: vessel.sog,

          cog: vessel.cog,

          heading: vessel.hdg,

          navStatus: vessel.navStatus,

          recordedAt: new Date(),
        },
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error(`[DATABASE][POSITION] ${vessel.mmsi}: ${error.message}`);
      } else {
        console.error(`[DATABASE][POSITION] ${vessel.mmsi}: database error`);
      }
    }
  }

  /**
   * ============================================================
   * FIND ONE FROM DATABASE
   * ============================================================
   *
   * Mengambil detail vessel lengkap dari PostgreSQL.
   *
   * Data yang dikembalikan:
   *
   * - Static information
   * - Latest position
   * - Latest receiver
   *
   * BigInt dikonversi menjadi string.
   */
  async findOneFromDatabase(mmsi: string) {
    try {
      /**
       * ========================================================
       * NORMALIZE MMSI
       * ========================================================
       */
      const safeMmsi = mmsi.trim();

      /**
       * ========================================================
       * VALIDASI MMSI
       * ========================================================
       */
      if (!safeMmsi) {
        return null;
      }

      /**
       * ========================================================
       * FIND VESSEL
       * ========================================================
       */
      const vessel = await this.prisma.vessel.findUnique({
        where: {
          mmsi: safeMmsi,
        },

        select: {
          /**
           * ==================================================
           * STATIC DATA
           * ==================================================
           */
          id: true,

          mmsi: true,

          name: true,

          callsign: true,

          imo: true,

          shipType: true,

          destination: true,

          length: true,

          width: true,

          createdAt: true,

          updatedAt: true,

          /**
           * ==================================================
           * LATEST POSITION
           * ==================================================
           */
          positions: {
            take: 1,

            orderBy: {
              recordedAt: 'desc',
            },

            select: {
              latitude: true,

              longitude: true,

              sog: true,

              cog: true,

              heading: true,

              navStatus: true,

              recordedAt: true,

              /**
               * ==============================================
               * RECEIVER
               * ==============================================
               */
              receiver: {
                select: {
                  id: true,

                  name: true,

                  host: true,

                  port: true,
                },
              },
            },
          },
        },
      });

      /**
       * ========================================================
       * NOT FOUND
       * ========================================================
       */
      if (!vessel) {
        return null;
      }

      /**
       * ========================================================
       * LATEST POSITION
       * ========================================================
       */
      const latestPosition = vessel.positions[0] ?? null;

      /**
       * ========================================================
       * RESPONSE
       * ========================================================
       */
      return {
        id: vessel.id.toString(),

        mmsi: vessel.mmsi,

        name: vessel.name,

        callsign: vessel.callsign,

        imo: vessel.imo,

        shipType: vessel.shipType,

        destination: vessel.destination,

        length: vessel.length,

        width: vessel.width,

        createdAt: vessel.createdAt,

        updatedAt: vessel.updatedAt,

        latestPosition: latestPosition
          ? {
              latitude: latestPosition.latitude,

              longitude: latestPosition.longitude,

              sog: latestPosition.sog,

              cog: latestPosition.cog,

              heading: latestPosition.heading,

              navStatus: latestPosition.navStatus,

              recordedAt: latestPosition.recordedAt,

              receiver: latestPosition.receiver,
            }
          : null,
      };
    } catch (error: unknown) {
      /**
       * ========================================================
       * ERROR
       * ========================================================
       */
      if (error instanceof Error) {
        console.error(`[DATABASE][FIND ONE VESSEL] ${mmsi}`, error.message);

        console.error(error.stack);
      } else {
        console.error(`[DATABASE][FIND ONE VESSEL] ${mmsi}`, error);
      }

      throw error;
    }
  }

  /**
   * ============================================================
   * FIND ONE
   * ============================================================
   *
   * Prioritas:
   *
   * 1. Realtime cache
   * 2. PostgreSQL
   *
   * Jika vessel sedang aktif,
   * realtime cache digunakan.
   *
   * Jika vessel tidak ada di cache,
   * PostgreSQL digunakan.
   */
  async findOne(mmsi: string) {
    /**
     * ========================================================
     * NORMALIZE MMSI
     * ========================================================
     */
    const safeMmsi = mmsi.trim();

    /**
     * ========================================================
     * CACHE
     * ========================================================
     */
    const cached = this.cache.get(safeMmsi);

    if (cached) {
      return cached;
    }

    /**
     * ========================================================
     * DATABASE FALLBACK
     * ========================================================
     */
    return this.findOneFromDatabase(safeMmsi);
  }

  /**
   * ============================================================
   * GET LATEST POSITION
   * ============================================================
   */
  async getLatestPosition(mmsi: string) {
    return this.prisma.vesselPosition.findFirst({
      where: {
        vessel: {
          mmsi,
        },
      },

      orderBy: {
        recordedAt: 'desc',
      },

      select: {
        latitude: true,

        longitude: true,

        sog: true,

        cog: true,

        heading: true,

        navStatus: true,

        recordedAt: true,

        receiver: {
          select: {
            id: true,

            name: true,
          },
        },
      },
    });
  }

  /**
   * ============================================================
   * GET POSITION HISTORY
   * ============================================================
   */
  async getPositionHistory(mmsi: string, page = 1, limit = 50) {
    /**
     * ========================================================
     * NORMALIZE PAGE
     * ========================================================
     */
    const safePage = Math.max(Number.isFinite(page) ? Math.floor(page) : 1, 1);

    /**
     * ========================================================
     * NORMALIZE LIMIT
     * ========================================================
     */
    const safeLimit = Math.min(
      Math.max(Number.isFinite(limit) ? Math.floor(limit) : 50, 1),
      100,
    );

    /**
     * ========================================================
     * OFFSET
     * ========================================================
     */
    const skip = (safePage - 1) * safeLimit;

    /**
     * ========================================================
     * WHERE
     * ========================================================
     */
    const where = {
      vessel: {
        mmsi,
      },
    };

    /**
     * ========================================================
     * DATABASE QUERY
     * ========================================================
     */
    const [total, data] = await Promise.all([
      this.prisma.vesselPosition.count({
        where,
      }),

      this.prisma.vesselPosition.findMany({
        where,

        orderBy: {
          recordedAt: 'desc',
        },

        skip,

        take: safeLimit,

        select: {
          latitude: true,

          longitude: true,

          sog: true,

          cog: true,

          heading: true,

          navStatus: true,

          recordedAt: true,

          receiver: {
            select: {
              id: true,

              name: true,
            },
          },
        },
      }),
    ]);

    /**
     * ========================================================
     * TOTAL PAGES
     * ========================================================
     */
    const totalPages = Math.ceil(total / safeLimit);

    /**
     * ========================================================
     * RESPONSE
     * ========================================================
     */
    return {
      data,

      meta: {
        page: safePage,

        limit: safeLimit,

        total,

        totalPages,

        hasNextPage: safePage < totalPages,

        hasPreviousPage: safePage > 1,
      },
    };
  }

  /**
   * ============================================================
   * FIND ALL
   * ============================================================
   *
   * Semua vessel realtime dari cache.
   */
  findAll(): Vessel[] {
    return this.cache.getAll();
  }

  /**
   * ============================================================
   * FIND ALL FROM DATABASE
   * ============================================================
   *
   * Mengambil vessel dari PostgreSQL.
   *
   * Support:
   *
   * 1. Pagination
   * 2. Search MMSI
   * 3. Search Name
   * 4. Search Callsign
   *
   * Contoh:
   *
   * /vessels/database
   *
   * /vessels/database?page=1&limit=20
   *
   * /vessels/database?search=BUANA
   *
   * /vessels/database?search=525200997
   *
   * /vessels/database?search=YBDSPVT
   *
   * /vessels/database?search=BUANA&page=1&limit=20
   *
   * Default:
   *
   * page  = 1
   * limit = 50
   *
   * Maximum:
   *
   * 100 vessel per request.
   */
  async findAllFromDatabase(page = 1, limit = 50, search?: string) {
    try {
      /**
       * ========================================================
       * NORMALIZE PAGE
       * ========================================================
       */
      const safePage = Math.max(
        Number.isFinite(page) ? Math.floor(page) : 1,
        1,
      );

      /**
       * ========================================================
       * NORMALIZE LIMIT
       * ========================================================
       *
       * Minimum 1.
       * Maximum 100.
       */
      const safeLimit = Math.min(
        Math.max(Number.isFinite(limit) ? Math.floor(limit) : 50, 1),
        100,
      );

      /**
       * ========================================================
       * NORMALIZE SEARCH
       * ========================================================
       */
      const safeSearch = typeof search === 'string' ? search.trim() : '';

      /**
       * ========================================================
       * BUILD WHERE
       * ========================================================
       *
       * Search dilakukan pada:
       *
       * - MMSI
       * - Name
       * - Callsign
       *
       * PostgreSQL melalui Prisma
       * menggunakan mode insensitive.
       */
      const where =
        safeSearch.length > 0
          ? {
              OR: [
                {
                  mmsi: {
                    contains: safeSearch,
                    mode: 'insensitive' as const,
                  },
                },

                {
                  name: {
                    contains: safeSearch,
                    mode: 'insensitive' as const,
                  },
                },

                {
                  callsign: {
                    contains: safeSearch,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : undefined;

      /**
       * ========================================================
       * OFFSET
       * ========================================================
       */
      const skip = (safePage - 1) * safeLimit;

      /**
       * ========================================================
       * DATABASE QUERY
       * ========================================================
       *
       * Count dan data dijalankan
       * secara paralel.
       */
      const [total, vessels] = await Promise.all([
        /**
         * ======================================================
         * TOTAL
         * ======================================================
         */
        this.prisma.vessel.count({
          where,
        }),

        /**
         * ======================================================
         * DATA
         * ======================================================
         */
        this.prisma.vessel.findMany({
          where,

          orderBy: {
            updatedAt: 'desc',
          },

          skip,

          take: safeLimit,

          select: {
            id: true,

            mmsi: true,

            name: true,

            callsign: true,

            imo: true,

            shipType: true,

            destination: true,

            length: true,

            width: true,

            createdAt: true,

            updatedAt: true,

            positions: {
              take: 1,

              orderBy: {
                recordedAt: 'desc',
              },

              select: {
                latitude: true,

                longitude: true,

                sog: true,

                cog: true,

                heading: true,

                navStatus: true,

                recordedAt: true,

                receiver: {
                  select: {
                    id: true,

                    name: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      /**
       * ========================================================
       * TOTAL PAGES
       * ========================================================
       */
      const totalPages = Math.ceil(total / safeLimit);

      /**
       * ========================================================
       * CONVERT BIGINT
       * ========================================================
       */
      const data = vessels.map((vessel) => ({
        ...vessel,

        id: vessel.id.toString(),
      }));

      /**
       * ========================================================
       * RESPONSE
       * ========================================================
       */
      return {
        data,

        meta: {
          page: safePage,

          limit: safeLimit,

          total,

          totalPages,

          hasNextPage: safePage < totalPages,

          hasPreviousPage: safePage > 1,

          search: safeSearch || null,
        },
      };
    } catch (error: unknown) {
      /**
       * ========================================================
       * DATABASE ERROR
       * ========================================================
       */
      if (error instanceof Error) {
        console.error('[DATABASE][FIND ALL VESSEL]', error.message);

        console.error(error.stack);
      } else {
        console.error('[DATABASE][FIND ALL VESSEL]', error);
      }

      throw error;
    }
  }

  /**
   * ============================================================
   * FIND BY BOUNDS
   * ============================================================
   *
   * Bounding box untuk peta.
   */
  findByBounds(
    north: number,
    south: number,
    east: number,
    west: number,
  ): Vessel[] {
    return this.cache.values().filter((vessel) => {
      /**
       * Vessel tanpa position
       * tidak ditampilkan di map.
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
   */
  values(): Vessel[] {
    return this.cache.values();
  }

  /**
   * ============================================================
   * CLEANUP
   * ============================================================
   */
  cleanup(timeoutMinutes = 15): number {
    const removed = this.cache.cleanup(timeoutMinutes);

    /**
     * Bersihkan throttle map
     * untuk vessel yang sudah hilang.
     */
    if (removed > 0) {
      /**
       * POSITION
       */
      for (const mmsi of this.lastPositionSaved.keys()) {
        if (!this.cache.has(mmsi)) {
          this.lastPositionSaved.delete(mmsi);
        }
      }

      /**
       * STATIC
       */
      for (const mmsi of this.lastStaticSaved.keys()) {
        if (!this.cache.has(mmsi)) {
          this.lastStaticSaved.delete(mmsi);
        }
      }
    }

    return removed;
  }

  /**
   * ============================================================
   * REMOVE
   * ============================================================
   *
   * Menghapus vessel dari realtime cache.
   *
   * Database tidak dihapus.
   */
  remove(mmsi: string): boolean {
    this.lastPositionSaved.delete(mmsi);

    this.lastStaticSaved.delete(mmsi);

    return this.cache.remove(mmsi);
  }

  /**
   * ============================================================
   * CLEAR
   * ============================================================
   *
   * Bersihkan seluruh realtime cache.
   *
   * Database tidak dihapus.
   */
  clear(): void {
    this.cache.clear();

    this.lastPositionSaved.clear();

    this.lastStaticSaved.clear();
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
