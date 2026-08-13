import { Injectable } from '@nestjs/common';

import { AisParser } from './parser/ais-parser';
import { AisFragmentAssembler } from './assembler/ais-fragment-assembler';
import { AisDecoderService } from './decoder/ais-decoder.service';

import { VesselService } from '../vessel/vessel.service';
import { Vessel } from '../vessel/interfaces/vessel.interface';

import { AisGateway } from '../gateway/ais.gateway';

/**
 * ============================================================
 * AIS STATISTICS
 * ============================================================
 */
export interface AisServiceStats {
  /**
   * Jumlah AIS sentence yang diterima.
   */
  received: number;

  /**
   * Jumlah sentence yang berhasil
   * diparse menjadi fragment.
   */
  parsed: number;

  /**
   * Jumlah multipart message yang
   * berhasil menjadi message lengkap.
   *
   * Single-part message juga dihitung
   * sebagai assembled.
   */
  assembled: number;

  /**
   * Jumlah message yang berhasil
   * didecode oleh AisDecoderService.
   */
  decoded: number;

  /**
   * Jumlah message yang gagal
   * pada proses decode.
   */
  failed: number;

  /**
   * Jumlah vessel yang berhasil
   * di-update melalui VesselService.
   */
  vesselUpdated: number;

  /**
   * Waktu terakhir AIS berhasil
   * didecode.
   */
  lastDecodedAt: Date | null;
}

@Injectable()
export class AisService {
  /**
   * ============================================================
   * AIS PARSER
   * ============================================================
   */
  private readonly parser = new AisParser();

  /**
   * ============================================================
   * AIS FRAGMENT ASSEMBLER
   * ============================================================
   */
  private readonly assembler = new AisFragmentAssembler();

  /**
   * ============================================================
   * STATISTICS
   * ============================================================
   *
   * Statistik disimpan per receiver.
   */
  private readonly statistics = new Map<string, AisServiceStats>();

  constructor(
    private readonly decoder: AisDecoderService,

    private readonly vesselService: VesselService,

    private readonly gateway: AisGateway,
  ) {}

  /**
   * ============================================================
   * HANDLE AIS SENTENCE
   * ============================================================
   */
  handle(
    receiverId: string,
    receiverName: string,
    sentence: string,
  ): Vessel | null {
    /**
     * ========================================================
     * GET STATISTICS
     * ========================================================
     */
    const stats = this.getOrCreateStats(receiverId);

    /**
     * ========================================================
     * RECEIVED
     * ========================================================
     *
     * Sentence AIS sudah sampai
     * ke AisService.
     */
    stats.received += 1;

    /**
     * ========================================================
     * PARSE SENTENCE
     * ========================================================
     */
    const fragment = this.parser.parse(receiverId, receiverName, sentence);

    /**
     * Parser gagal.
     */
    if (!fragment) {
      stats.failed += 1;

      return null;
    }

    /**
     * ========================================================
     * PARSED
     * ========================================================
     */
    stats.parsed += 1;

    /**
     * ========================================================
     * ASSEMBLE MULTIPART MESSAGE
     * ========================================================
     */
    const completed = this.assembler.assemble(fragment);

    /**
     * ========================================================
     * BELUM LENGKAP
     * ========================================================
     *
     * Ini BUKAN decode failure.
     *
     * Contoh:
     *
     * !AIVDM,2,1,...
     *
     * masih menunggu:
     *
     * !AIVDM,2,2,...
     */
    if (!completed) {
      return null;
    }

    /**
     * ========================================================
     * ASSEMBLED
     * ========================================================
     */
    stats.assembled += 1;

    /**
     * ========================================================
     * DECODE AIS
     * ========================================================
     */
    const decoded = this.decoder.decode(completed);

    /**
     * ========================================================
     * DECODE FAILED
     * ========================================================
     */
    if (!decoded) {
      stats.failed += 1;

      return null;
    }

    /**
     * ========================================================
     * DECODED
     * ========================================================
     */
    stats.decoded += 1;

    stats.lastDecodedAt = new Date();

    /**
     * ========================================================
     * UPDATE VESSEL CACHE
     * ========================================================
     */
    const vessel = this.vesselService.update(decoded);

    /**
     * ========================================================
     * VESSEL UPDATED
     * ========================================================
     */
    stats.vesselUpdated += 1;

    /**
     * ========================================================
     * BROADCAST VESSEL
     * ========================================================
     *
     * Gunakan object vessel yang sama
     * seperti implementasi sebelumnya.
     */
    this.gateway.broadcastVessel(vessel);

    /**
     * ========================================================
     * RETURN VESSEL
     * ========================================================
     */
    return vessel;
  }

  /**
   * ============================================================
   * GET OR CREATE STATISTICS
   * ============================================================
   */
  private getOrCreateStats(receiverId: string): AisServiceStats {
    const existing = this.statistics.get(receiverId);

    if (existing) {
      return existing;
    }

    const stats: AisServiceStats = {
      received: 0,

      parsed: 0,

      assembled: 0,

      decoded: 0,

      failed: 0,

      vesselUpdated: 0,

      lastDecodedAt: null,
    };

    this.statistics.set(receiverId, stats);

    return stats;
  }

  /**
   * ============================================================
   * GET STATISTICS
   * ============================================================
   */
  getStats(receiverId: string): AisServiceStats {
    const stats = this.statistics.get(receiverId);

    if (!stats) {
      return {
        received: 0,

        parsed: 0,

        assembled: 0,

        decoded: 0,

        failed: 0,

        vesselUpdated: 0,

        lastDecodedAt: null,
      };
    }

    /**
     * Return copy agar state internal
     * tidak bisa diubah dari luar.
     */
    return {
      ...stats,
    };
  }

  /**
   * ============================================================
   * GET ALL STATISTICS
   * ============================================================
   */
  getAllStats(): Map<string, AisServiceStats> {
    return new Map(
      Array.from(this.statistics.entries()).map(([receiverId, stats]) => [
        receiverId,
        {
          ...stats,
        },
      ]),
    );
  }

  /**
   * ============================================================
   * RESET STATISTICS
   * ============================================================
   */
  resetStats(receiverId: string): void {
    this.statistics.set(receiverId, {
      received: 0,

      parsed: 0,

      assembled: 0,

      decoded: 0,

      failed: 0,

      vesselUpdated: 0,

      lastDecodedAt: null,
    });
  }
}
