import { AisFragment } from '../interfaces/ais-fragment.interface';
import { CompletedAisMessage } from '../interfaces/completed-ais-message.interface';

interface FragmentSession {
  total: number;

  receiverId: string;
  receiverName: string;

  channel: string;
  sequenceId: string;

  fragments: Map<number, AisFragment>;

  createdAt: number;
  updatedAt: number;
}

export class AisFragmentAssembler {
  /**
   * Timeout multipart message.
   */
  private readonly SESSION_TTL_MS = 10_000;

  /**
   * Semua multipart session.
   */
  private readonly sessions = new Map<string, FragmentSession>();

  /**
   * Assemble AIS fragment.
   */
  assemble(fragment: AisFragment): CompletedAisMessage | null {
    /**
     * Bersihkan session expired.
     */
    this.cleanupExpired();

    /**
     * ============================================================
     * SINGLE SENTENCE
     * ============================================================
     */
    if (fragment.total === 1) {
      return {
        receiverId: fragment.receiverId,
        receiverName: fragment.receiverName,
        raw: fragment.raw,
        channel: fragment.channel,
        payload: fragment.payload,
        fillBits: fragment.fillBits,
        total: 1,
      };
    }

    /**
     * ============================================================
     * VALIDASI TOTAL
     * ============================================================
     */
    if (fragment.total < 2) {
      return null;
    }

    /**
     * ============================================================
     * VALIDASI NOMOR FRAGMENT
     * ============================================================
     */
    if (fragment.current < 1 || fragment.current > fragment.total) {
      return null;
    }

    /**
     * ============================================================
     * SEQUENCE ID
     * ============================================================
     *
     * Sequence ID pada multipart AIS bisa kosong.
     *
     * Contoh:
     *
     * !AIVDM,2,1,,A,...
     * !AIVDM,2,2,,A,...
     *
     * Karena itu jangan reject jika kosong.
     */
    const sequenceId = fragment.sequenceId || '-';

    /**
     * ============================================================
     * SESSION KEY
     * ============================================================
     */
    const key = this.createKey(fragment, sequenceId);

    let session = this.sessions.get(key);

    /**
     * ============================================================
     * CREATE SESSION
     * ============================================================
     */
    if (!session) {
      session = {
        total: fragment.total,

        receiverId: fragment.receiverId,

        receiverName: fragment.receiverName,

        channel: fragment.channel,

        sequenceId,

        fragments: new Map<number, AisFragment>(),

        createdAt: Date.now(),

        updatedAt: Date.now(),
      };

      this.sessions.set(key, session);
    }

    /**
     * ============================================================
     * TOTAL HARUS SAMA
     * ============================================================
     */
    if (session.total !== fragment.total) {
      this.sessions.delete(key);

      session = {
        total: fragment.total,

        receiverId: fragment.receiverId,

        receiverName: fragment.receiverName,

        channel: fragment.channel,

        sequenceId,

        fragments: new Map<number, AisFragment>(),

        createdAt: Date.now(),

        updatedAt: Date.now(),
      };

      this.sessions.set(key, session);
    }

    /**
     * ============================================================
     * UPDATE SESSION
     * ============================================================
     */
    session.updatedAt = Date.now();

    /**
     * ============================================================
     * SIMPAN FRAGMENT
     * ============================================================
     */
    session.fragments.set(fragment.current, fragment);

    /**
     * ============================================================
     * BELUM LENGKAP
     * ============================================================
     */
    if (session.fragments.size < session.total) {
      return null;
    }

    /**
     * ============================================================
     * PASTIKAN SEMUA FRAGMENT ADA
     * ============================================================
     */
    for (let i = 1; i <= session.total; i++) {
      if (!session.fragments.has(i)) {
        return null;
      }
    }

    /**
     * ============================================================
     * GABUNG PAYLOAD
     * ============================================================
     */
    let payload = '';

    let fillBits = 0;

    const rawParts: string[] = [];

    for (let i = 1; i <= session.total; i++) {
      const part = session.fragments.get(i);

      if (!part) {
        return null;
      }

      /**
       * Gabungkan payload.
       */
      payload += part.payload;

      /**
       * Simpan raw NMEA.
       */
      rawParts.push(part.raw);

      /**
       * Fill bits hanya dari
       * fragment terakhir.
       */
      if (i === session.total) {
        fillBits = part.fillBits;
      }
    }

    /**
     * ============================================================
     * RAW MULTIPART
     * ============================================================
     */
    const raw = rawParts.join('\n');

    /**
     * ============================================================
     * HAPUS SESSION
     * ============================================================
     */
    this.sessions.delete(key);

    /**
     * ============================================================
     * RETURN COMPLETED MESSAGE
     * ============================================================
     */
    return {
      receiverId: fragment.receiverId,

      receiverName: fragment.receiverName,

      raw,

      channel: fragment.channel,

      payload,

      fillBits,

      total: session.total,
    };
  }

  /**
   * ============================================================
   * CREATE SESSION KEY
   * ============================================================
   */
  private createKey(fragment: AisFragment, sequenceId: string): string {
    return [fragment.receiverId, fragment.channel || '-', sequenceId].join(':');
  }

  /**
   * ============================================================
   * GET MISSING FRAGMENTS
   * ============================================================
   */
  private getMissingFragments(session: FragmentSession): number[] {
    const missing: number[] = [];

    for (let i = 1; i <= session.total; i++) {
      if (!session.fragments.has(i)) {
        missing.push(i);
      }
    }

    return missing;
  }

  /**
   * ============================================================
   * CLEANUP EXPIRED SESSION
   * ============================================================
   */
  private cleanupExpired(): void {
    const now = Date.now();

    for (const [key, session] of this.sessions.entries()) {
      const age = now - session.updatedAt;

      if (age > this.SESSION_TTL_MS) {
        this.sessions.delete(key);
      }
    }
  }

  /**
   * ============================================================
   * CLEAR
   * ============================================================
   */
  clear(): void {
    this.sessions.clear();
  }

  /**
   * ============================================================
   * SIZE
   * ============================================================
   */
  size(): number {
    this.cleanupExpired();

    return this.sessions.size;
  }
}
