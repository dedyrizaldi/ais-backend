/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';

@Injectable()
export class AisDebugFileService {
  /**
   * Debug AIS dinonaktifkan sementara.
   *
   * Method write() tetap dipertahankan karena
   * AisDecoderService masih melakukan dependency
   * terhadap AisDebugFileService.
   *
   * Tidak ada file ais-debug.json yang dibuat,
   * dibaca, atau ditulis.
   */
  write(_event: string, _data: unknown): void {
    // Debug disabled.
  }
}
