import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { DecodedAisMessage } from '../ais/interfaces/decoded-ais.interface';
import { PrismaService } from '../database/prisma.service';

import { Vessel } from './interfaces/vessel.interface';
import { VesselCache } from './cache/vessel.cache';
import { AisVesselMapper } from './mapper/ais-vessel.mapper';

@Injectable()
export class VesselService implements OnModuleDestroy {
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
   * SMART POSITION HISTORY
   * ============================================================
   *
   * History TIDAK disimpan setiap AIS message.
   *
   * Rule:
   * - posisi pertama        -> SAVE
   * - minimum interval      -> wajib terpenuhi
   * - distance >= threshold -> SAVE
   * - atau maximum interval -> SAVE
   *
   * Distance TIDAK boleh lagi bypass minimum interval.
   */
  private readonly POSITION_MIN_DISTANCE_NM = 0.05;

  /** Minimum course change considered significant. */
  private readonly POSITION_COURSE_CHANGE_DEGREES = 15;

  /** Maximum plausible vessel speed used for jump validation. */
  private readonly POSITION_MAX_REASONABLE_SPEED_KNOTS = 60;

  private readonly POSITION_INTERVAL_STATIONARY_MS = 5 * 60 * 1000;
  private readonly POSITION_INTERVAL_SLOW_MS = 2 * 60 * 1000;
  private readonly POSITION_INTERVAL_NORMAL_MS = 60 * 1000;
  private readonly POSITION_INTERVAL_FAST_MS = 30 * 1000;

  /**
   * Tidak boleh ada vessel yang terlalu lama tanpa history point.
   */
  private readonly POSITION_MAX_INTERVAL_MS = 5 * 60 * 1000;

  /**
   * Position jump divalidasi berdasarkan elapsed time + knots,
   * bukan distance absolut, sehingga kapal yang memang bergerak jauh
   * tidak otomatis dianggap invalid.
   */
  private readonly POSITION_MAX_JUMP_METERS = 10_000;

  /**
   * ============================================================
   * POSITION BATCH WRITER
   * ============================================================
   *
   * Posisi yang lolos smart filter dikumpulkan dulu.
   *
   * Flush jika:
   * - buffer mencapai 100 row, ATAU
   * - timer mencapai 5 detik.
   */
  private readonly POSITION_BATCH_SIZE = 100;
  private readonly POSITION_BATCH_FLUSH_INTERVAL_MS = 5_000;

  private readonly positionBuffer: Array<{
    mmsi: string;
    receiverId: string;
    latitude: number;
    longitude: number;
    sog: number | null | undefined;
    cog: number | null | undefined;
    heading: number | null | undefined;
    navStatus: number | null | undefined;
    vesselName?: string;
    callsign?: string;
    imo?: number;
    shipType?: number;
    destination?: string;
    recordedAt: Date;
  }> = [];

  private positionBufferFlushTimer?: ReturnType<typeof setInterval>;
  private isFlushingPositionBuffer = false;
  private positionBufferRetryDelayMs = this.POSITION_BATCH_FLUSH_INTERVAL_MS;
  private nextPositionBufferRetryAt = 0;

  /**
   * SMART POSITION DEBUG
   *
   * true  -> tampilkan alasan SAVE / SKIP di console.
   * false -> matikan log per AIS position.
   */
  private readonly POSITION_DEBUG = false;

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
  private readonly lastPersistedPositions = new Map<
    string,
    {
      latitude: number;
      longitude: number;
      recordedAt: number;
      cog: number | null | undefined;
      navStatus: number | null | undefined;
    }
  >();

  private readonly pendingPositionSaves = new Set<string>();

  /**
   * ============================================================
   * LAST STATIC SAVED
   * ============================================================
   *
   * Timestamp terakhir static data diproses
   * ke database berdasarkan MMSI.
   */
  private readonly lastStaticSaved = new Map<string, number>();

  /**
   * ============================================================
   * DATABASE QUEUE PER MMSI
   * ============================================================
   *
   * Semua operasi database untuk MMSI yang sama diproses
   * secara berurutan untuk mencegah race condition.
   */
  private readonly databaseQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly mapper: AisVesselMapper,
    private readonly prisma: PrismaService,
  ) {
    this.positionBufferFlushTimer = setInterval(() => {
      void this.flushPositionBuffer();
    }, this.POSITION_BATCH_FLUSH_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.positionBufferFlushTimer) {
      clearInterval(this.positionBufferFlushTimer);
      this.positionBufferFlushTimer = undefined;
    }

    await this.flushPositionBuffer();
  }

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

    this.enqueueDatabaseTask(vessel.mmsi, () => this.persistVessel(vessel));
  }

  /**
   * ============================================================
   * QUEUE POSITION SAVE
   * ============================================================
   */
  private queuePositionSave(vessel: Vessel, receiverId?: string): void {
    if (vessel.lat === undefined || vessel.lon === undefined) {
      return;
    }

    if (!receiverId) {
      return;
    }

    /**
     * Satu pending position per MMSI.
     *
     * Setelah posisi masuk buffer, kita anggap posisi tersebut
     * sudah "reserved" untuk history. AIS berikutnya tidak akan
     * membuat row tambahan sampai batch selesai diproses.
     */
    if (this.pendingPositionSaves.has(vessel.mmsi)) {
      if (this.POSITION_DEBUG) {
        console.log(`[POSITION][SKIP] ${vessel.mmsi} | reason=PENDING_BUFFER`);
      }
      return;
    }

    const decision = this.getPositionPersistenceDecision(vessel);

    if (!decision.shouldPersist) {
      if (this.POSITION_DEBUG) {
        console.log(
          `[POSITION][SKIP] ${vessel.mmsi} | ` +
            `reason=${decision.reason} | ` +
            `distance=${decision.distanceNm.toFixed(3)}NM | ` +
            `elapsed=${Math.floor(decision.elapsedMs / 1000)}s | ` +
            `interval=${Math.floor(decision.requiredIntervalMs / 1000)}s`,
        );
      }
      return;
    }

    if (this.POSITION_DEBUG) {
      console.log(
        `[POSITION][BUFFER] ${vessel.mmsi} | reason=${decision.reason}` +
          (decision.distanceNm > 0
            ? ` | distance=${decision.distanceNm.toFixed(3)}NM`
            : '') +
          (decision.elapsedMs > 0
            ? ` | elapsed=${Math.floor(decision.elapsedMs / 1000)}s`
            : ''),
      );
    }

    this.pendingPositionSaves.add(vessel.mmsi);

    this.positionBuffer.push({
      mmsi: vessel.mmsi,
      receiverId,
      latitude: vessel.lat,
      longitude: vessel.lon,
      sog: vessel.sog,
      cog: vessel.cog,
      heading: vessel.hdg,
      navStatus: vessel.navStatus,
      vesselName: vessel.name,
      callsign: vessel.callsign,
      imo: vessel.imo,
      shipType: vessel.shipType,
      destination: vessel.destination,
      recordedAt: new Date(),
    });

    /**
     * Update hanya dilakukan setelah batch benar-benar berhasil.
     * Dengan demikian jika database gagal, posisi masih bisa retry.
     */
    if (this.positionBuffer.length >= this.POSITION_BATCH_SIZE) {
      void this.flushPositionBuffer();
    }
  }

  private getPositionSaveIntervalMs(sog: number | null | undefined): number {
    const speed = sog ?? 0;
    if (speed < 1) return this.POSITION_INTERVAL_STATIONARY_MS;
    if (speed < 5) return this.POSITION_INTERVAL_SLOW_MS;
    if (speed < 10) return this.POSITION_INTERVAL_NORMAL_MS;
    return this.POSITION_INTERVAL_FAST_MS;
  }

  private calculateDistanceMeters(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ): number {
    const EARTH_RADIUS_METERS = 6_371_000;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRadians(latitude2 - latitude1);
    const dLon = toRadians(longitude2 - longitude1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(latitude1)) *
        Math.cos(toRadians(latitude2)) *
        Math.sin(dLon / 2) ** 2;

    return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private calculateDistanceNm(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ): number {
    return (
      this.calculateDistanceMeters(
        latitude1,
        longitude1,
        latitude2,
        longitude2,
      ) / 1852
    );
  }

  private calculateCourseDifference(
    course1: number | null | undefined,
    course2: number | null | undefined,
  ): number {
    if (course1 == null || course2 == null) {
      return 0;
    }

    const diff = Math.abs(course1 - course2) % 360;
    return Math.min(diff, 360 - diff);
  }

  private getPositionPersistenceDecision(vessel: Vessel): {
    shouldPersist: boolean;
    reason:
      | 'FIRST'
      | 'DISTANCE'
      | 'COURSE_CHANGE'
      | 'NAV_STATUS_CHANGE'
      | 'MAX_INTERVAL'
      | 'TIME'
      | 'ABNORMAL_JUMP';
    distanceNm: number;
    elapsedMs: number;
    requiredIntervalMs: number;
    estimatedSpeedKnots: number;
  } {
    if (vessel.lat == null || vessel.lon == null) {
      return {
        shouldPersist: false,
        reason: 'TIME',
        distanceNm: 0,
        elapsedMs: 0,
        requiredIntervalMs: 0,
        estimatedSpeedKnots: 0,
      };
    }

    const previous = this.lastPersistedPositions.get(vessel.mmsi);
    const requiredIntervalMs = this.getPositionSaveIntervalMs(vessel.sog);

    if (!previous) {
      return {
        shouldPersist: true,
        reason: 'FIRST',
        distanceNm: 0,
        elapsedMs: 0,
        requiredIntervalMs,
        estimatedSpeedKnots: 0,
      };
    }

    const distanceNm = this.calculateDistanceNm(
      previous.latitude,
      previous.longitude,
      vessel.lat,
      vessel.lon,
    );

    const elapsedMs = Math.max(0, Date.now() - previous.recordedAt);
    const elapsedHours = elapsedMs / 3_600_000;
    const estimatedSpeedKnots =
      elapsedHours > 0 ? distanceNm / elapsedHours : 0;

    /**
     * A distance jump is not automatically invalid.
     * Validate it against elapsed time and a conservative speed limit.
     */
    if (
      elapsedMs > 0 &&
      estimatedSpeedKnots > this.POSITION_MAX_REASONABLE_SPEED_KNOTS
    ) {
      return {
        shouldPersist: false,
        reason: 'ABNORMAL_JUMP',
        distanceNm,
        elapsedMs,
        requiredIntervalMs,
        estimatedSpeedKnots,
      };
    }

    const navStatusChanged =
      previous.navStatus != null &&
      vessel.navStatus != null &&
      previous.navStatus !== vessel.navStatus;

    /**
     * Navigational status changes are rare but operationally important,
     * so they are allowed to trigger a history point immediately.
     */
    if (navStatusChanged) {
      return {
        shouldPersist: true,
        reason: 'NAV_STATUS_CHANGE',
        distanceNm,
        elapsedMs,
        requiredIntervalMs,
        estimatedSpeedKnots,
      };
    }

    /** Hard lower bound: ordinary position writes cannot happen faster. */
    if (elapsedMs < requiredIntervalMs) {
      return {
        shouldPersist: false,
        reason: 'TIME',
        distanceNm,
        elapsedMs,
        requiredIntervalMs,
        estimatedSpeedKnots,
      };
    }

    const courseChange = this.calculateCourseDifference(
      previous.cog,
      vessel.cog,
    );

    if (
      courseChange >= this.POSITION_COURSE_CHANGE_DEGREES &&
      elapsedMs >= requiredIntervalMs
    ) {
      return {
        shouldPersist: true,
        reason: 'COURSE_CHANGE',
        distanceNm,
        elapsedMs,
        requiredIntervalMs,
        estimatedSpeedKnots,
      };
    }

    if (distanceNm >= this.POSITION_MIN_DISTANCE_NM) {
      return {
        shouldPersist: true,
        reason: 'DISTANCE',
        distanceNm,
        elapsedMs,
        requiredIntervalMs,
        estimatedSpeedKnots,
      };
    }

    if (elapsedMs >= this.POSITION_MAX_INTERVAL_MS) {
      return {
        shouldPersist: true,
        reason: 'MAX_INTERVAL',
        distanceNm,
        elapsedMs,
        requiredIntervalMs,
        estimatedSpeedKnots,
      };
    }

    return {
      shouldPersist: false,
      reason: 'TIME',
      distanceNm,
      elapsedMs,
      requiredIntervalMs,
      estimatedSpeedKnots,
    };
  }

  private shouldPersistPosition(vessel: Vessel): boolean {
    return this.getPositionPersistenceDecision(vessel).shouldPersist;
  }

  private markPositionAsPersisted(vessel: Vessel): void {
    if (vessel.lat === undefined || vessel.lon === undefined) return;

    this.lastPersistedPositions.set(vessel.mmsi, {
      latitude: vessel.lat,
      longitude: vessel.lon,
      recordedAt: Date.now(),
      cog: vessel.cog,
      navStatus: vessel.navStatus,
    });
  }

  /**
   * ============================================================
   * BATCH POSITION WRITER
   * ============================================================
   */

  private async flushPositionBuffer(): Promise<void> {
    if (Date.now() < this.nextPositionBufferRetryAt) {
      return;
    }

    if (this.isFlushingPositionBuffer) {
      return;
    }

    if (this.positionBuffer.length === 0) {
      return;
    }

    this.isFlushingPositionBuffer = true;

    const batch = this.positionBuffer.splice(0, this.POSITION_BATCH_SIZE);

    try {
      /**
       * Pastikan semua vessel yang ada di batch tersedia.
       *
       * createMany + skipDuplicates aman terhadap race dengan
       * static upsert.
       */
      const uniqueVessels = Array.from(
        new Map(batch.map((item) => [item.mmsi, item])).values(),
      );

      if (uniqueVessels.length > 0) {
        await this.prisma.vessel.createMany({
          data: uniqueVessels.map((item) => ({
            mmsi: item.mmsi,
            name: item.vesselName,
            callsign: item.callsign,
            imo: item.imo,
            shipType: item.shipType,
            destination: item.destination,
          })),
          skipDuplicates: true,
        });
      }

      const vessels = await this.prisma.vessel.findMany({
        where: {
          mmsi: {
            in: uniqueVessels.map((item) => item.mmsi),
          },
        },
        select: {
          id: true,
          mmsi: true,
        },
      });

      const vesselIdByMmsi = new Map(
        vessels.map((vessel) => [vessel.mmsi, vessel.id]),
      );

      const positionRows = batch
        .map((item) => {
          const vesselId = vesselIdByMmsi.get(item.mmsi);

          if (vesselId === undefined) {
            throw new Error(`Vessel ${item.mmsi} not found after ensure`);
          }

          return {
            vesselId,
            receiverId: item.receiverId,
            latitude: item.latitude,
            longitude: item.longitude,
            sog: item.sog,
            cog: item.cog,
            heading: item.heading,
            navStatus: item.navStatus,
            recordedAt: item.recordedAt,
          };
        })
        .filter(
          (
            row,
          ): row is {
            vesselId: bigint;
            receiverId: string;
            latitude: number;
            longitude: number;
            sog: number | null | undefined;
            cog: number | null | undefined;
            heading: number | null | undefined;
            navStatus: number | null | undefined;
            recordedAt: Date;
          } => row !== null,
        );

      if (positionRows.length > 0) {
        await this.prisma.vesselPosition.createMany({
          data: positionRows,
        });
      }

      /**
       * Batch berhasil.
       * Sekarang baru tandai posisi sebagai persisted.
       */
      for (const item of batch) {
        this.lastPersistedPositions.set(item.mmsi, {
          latitude: item.latitude,
          longitude: item.longitude,
          recordedAt: item.recordedAt.getTime(),
          cog: item.cog,
          navStatus: item.navStatus,
        });

        this.pendingPositionSaves.delete(item.mmsi);
      }

      this.positionBufferRetryDelayMs = this.POSITION_BATCH_FLUSH_INTERVAL_MS;
      this.nextPositionBufferRetryAt = 0;

      if (this.POSITION_DEBUG) {
        console.log(
          `[POSITION][BATCH] inserted=${positionRows.length} ` +
            `bufferRemaining=${this.positionBuffer.length}`,
        );
      }
    } catch (error: unknown) {
      /**
       * Database gagal.
       *
       * Kembalikan batch ke depan buffer agar dapat dicoba lagi.
       * pending tetap ada sampai data benar-benar berhasil.
       */
      this.positionBuffer.unshift(...batch);

      this.nextPositionBufferRetryAt =
        Date.now() + this.positionBufferRetryDelayMs;
      this.positionBufferRetryDelayMs = Math.min(
        this.positionBufferRetryDelayMs * 2,
        60_000,
      );

      if (error instanceof Error) {
        console.error(
          `[DATABASE][POSITION][BATCH] failed: ${error.message} ` +
            `retryIn=${Math.ceil((this.nextPositionBufferRetryAt - Date.now()) / 1000)}s`,
        );
      } else {
        console.error(
          `[DATABASE][POSITION][BATCH] failed ` +
            `retryIn=${Math.ceil((this.nextPositionBufferRetryAt - Date.now()) / 1000)}s`,
        );
      }

      /**
       * Jangan drop history secara otomatis.
       * Karena pendingPositionSaves tetap aktif, setiap MMSI hanya
       * dapat memiliki satu row yang menunggu. Ini memberi backpressure
       * alami dan mencegah memory tumbuh satu row per AIS message.
       */
    } finally {
      this.isFlushingPositionBuffer = false;

      /**
       * Jika selama flush buffer sudah kembali penuh,
       * langsung lanjutkan flush berikutnya.
       */
      if (
        this.positionBuffer.length >= this.POSITION_BATCH_SIZE &&
        !this.isFlushingPositionBuffer
      ) {
        void this.flushPositionBuffer();
      }
    }
  }

  /**
   * ============================================================
   * ENQUEUE DATABASE TASK
   * ============================================================
   *
   * Semua operasi database untuk MMSI yang sama dijalankan
   * secara berurutan.
   */
  private enqueueDatabaseTask(mmsi: string, task: () => Promise<void>): void {
    const previous = this.databaseQueues.get(mmsi);

    const queuedTask = (previous ?? Promise.resolve())
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (this.databaseQueues.get(mmsi) === queuedTask) {
          this.databaseQueues.delete(mmsi);
        }
      });

    this.databaseQueues.set(mmsi, queuedTask);

    void queuedTask.catch((error: unknown) => {
      if (error instanceof Error) {
        console.error(`[DATABASE][QUEUE] ${mmsi}: ${error.message}`);
      } else {
        console.error(`[DATABASE][QUEUE] ${mmsi}: database error`);
      }
    });
  }

  /**
   * ============================================================
   * PERSIST VESSEL
   * ============================================================
   */
  private async persistVessel(vessel: Vessel): Promise<void> {
    try {
      /**
       * ======================================================
       * UPSERT VESSEL
       * ======================================================
       *
       * MMSI adalah unique.
       *
       * Jangan menggunakan:
       *
       * findUnique()
       *     ↓
       * if (!existing)
       *     ↓
       * create()
       *
       * karena dua AIS message yang datang bersamaan
       * dapat menyebabkan race condition.
       *
       * Dengan upsert:
       *
       * MMSI belum ada → CREATE
       * MMSI sudah ada → UPDATE
       */

      const updateData: {
        name?: string;
        callsign?: string;
        imo?: number;
        shipType?: number;
        destination?: string;
      } = {};

      /**
       * ======================================================
       * UPDATE DATA
       * ======================================================
       *
       * Hanya update field yang mempunyai data.
       *
       * Ini penting supaya data static yang sudah tersimpan
       * tidak ditimpa dengan undefined/null dari message AIS
       * yang tidak lengkap.
       */

      if (vessel.name) {
        updateData.name = vessel.name;
      }

      if (vessel.callsign) {
        updateData.callsign = vessel.callsign;
      }

      if (vessel.imo !== undefined) {
        updateData.imo = vessel.imo;
      }

      if (vessel.shipType !== undefined) {
        updateData.shipType = vessel.shipType;
      }

      if (vessel.destination) {
        updateData.destination = vessel.destination;
      }

      /**
       * ======================================================
       * UPSERT
       * ======================================================
       */

      await this.prisma.vessel.upsert({
        where: {
          mmsi: vessel.mmsi,
        },

        /**
         * ====================================================
         * CREATE
         * ====================================================
         */

        create: {
          mmsi: vessel.mmsi,

          name: vessel.name,

          callsign: vessel.callsign,

          imo: vessel.imo,

          shipType: vessel.shipType,

          destination: vessel.destination,
        },

        /**
         * ====================================================
         * UPDATE
         * ====================================================
         */

        update: updateData,
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
      for (const mmsi of this.lastPersistedPositions.keys()) {
        if (!this.cache.has(mmsi)) {
          this.lastPersistedPositions.delete(mmsi);
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
    this.lastPersistedPositions.delete(mmsi);
    this.lastStaticSaved.delete(mmsi);

    /**
     * Pending history tidak dihapus karena mungkin sedang menunggu
     * database. Setelah berhasil, pending akan dilepas oleh batch writer.
     */
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

    this.lastPersistedPositions.clear();

    /**
     * Jangan menghapus positionBuffer di sini. Data yang sudah lolos
     * filter masih merupakan history yang harus ditulis ke database.
     */
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
