import { Vessel } from '../interfaces/vessel.interface';

export class VesselCache {
  /**
   * Cache vessel berdasarkan MMSI.
   */
  private readonly vessels = new Map<string, Vessel>();

  /**
   * ============================================================
   * SET
   * ============================================================
   *
   * General merge.
   *
   * Digunakan ketika vessel belum memiliki
   * handler khusus untuk message type tertentu.
   */
  set(vessel: Vessel): Vessel {
    const existing = this.vessels.get(vessel.mmsi);

    /**
     * Vessel belum ada.
     */
    if (!existing) {
      const newVessel: Vessel = {
        ...vessel,
        updatedAt: new Date(),
      };

      this.vessels.set(vessel.mmsi, newVessel);

      return newVessel;
    }

    /**
     * Merge.
     *
     * Data undefined dari message baru tidak boleh
     * menghapus data lama.
     */
    const merged: Vessel = {
      ...existing,
      ...this.removeUndefined(vessel),
      updatedAt: new Date(),
    };

    this.vessels.set(vessel.mmsi, merged);

    return merged;
  }

  /**
   * ============================================================
   * UPDATE POSITION
   * ============================================================
   *
   * Message:
   *
   * Type 1
   * Type 2
   * Type 3
   * Type 18
   * Type 19
   */
  updatePosition(vessel: Vessel): Vessel {
    const existing = this.vessels.get(vessel.mmsi);

    /**
     * Vessel belum ada.
     */
    if (!existing) {
      const newVessel: Vessel = {
        ...this.removeUndefined(vessel),
        updatedAt: new Date(),
      };

      this.vessels.set(vessel.mmsi, newVessel);

      return newVessel;
    }

    /**
     * ========================================================
     * POSITION
     * ========================================================
     */

    if (vessel.lat !== undefined) {
      existing.lat = vessel.lat;
    }

    if (vessel.lon !== undefined) {
      existing.lon = vessel.lon;
    }

    if (vessel.sog !== undefined) {
      existing.sog = vessel.sog;
    }

    if (vessel.cog !== undefined) {
      existing.cog = vessel.cog;
    }

    if (vessel.hdg !== undefined) {
      existing.hdg = vessel.hdg;
    }

    if (vessel.navStatus !== undefined) {
      existing.navStatus = vessel.navStatus;
    }

    /**
     * ========================================================
     * STATIC DATA
     * ========================================================
     *
     * Dynamic message kadang juga membawa static data
     * tergantung tipe message.
     *
     * Jangan overwrite data lama dengan undefined.
     */

    if (vessel.name !== undefined && vessel.name.trim() !== '') {
      existing.name = vessel.name;
    }

    if (vessel.callsign !== undefined && vessel.callsign.trim() !== '') {
      existing.callsign = vessel.callsign;
    }

    if (vessel.destination !== undefined && vessel.destination.trim() !== '') {
      existing.destination = vessel.destination;
    }

    if (vessel.imo !== undefined) {
      existing.imo = vessel.imo;
    }

    if (vessel.shipType !== undefined) {
      existing.shipType = vessel.shipType;
    }

    /**
     * ========================================================
     * RECEIVER
     * ========================================================
     */

    if (vessel.receiverId !== undefined) {
      existing.receiverId = vessel.receiverId;
    }

    if (vessel.receiverName !== undefined) {
      existing.receiverName = vessel.receiverName;
    }

    /**
     * ========================================================
     * MESSAGE TYPE
     * ========================================================
     */

    if (vessel.messageType !== undefined) {
      existing.messageType = vessel.messageType;
    }

    /**
     * ========================================================
     * UPDATED
     * ========================================================
     */

    existing.updatedAt = new Date();

    this.vessels.set(existing.mmsi, existing);

    return existing;
  }

  /**
   * ============================================================
   * UPDATE STATIC
   * ============================================================
   *
   * Message:
   *
   * Type 5
   * Type 24
   *
   * PENTING:
   *
   * Type 5 / Type 24 tidak boleh menghapus
   * data position yang sudah ada.
   */
  updateStatic(vessel: Vessel): Vessel {
    const existing = this.vessels.get(vessel.mmsi);

    /**
     * ========================================================
     * VESSEL BELUM ADA
     * ========================================================
     */
    if (!existing) {
      const newVessel: Vessel = {
        ...this.removeUndefined(vessel),
        updatedAt: new Date(),
      };

      this.vessels.set(vessel.mmsi, newVessel);

      return newVessel;
    }

    /**
     * ========================================================
     * STATIC
     * ========================================================
     */

    if (vessel.name !== undefined && vessel.name.trim() !== '') {
      existing.name = vessel.name;
    }

    if (vessel.callsign !== undefined && vessel.callsign.trim() !== '') {
      existing.callsign = vessel.callsign;
    }

    if (vessel.destination !== undefined && vessel.destination.trim() !== '') {
      existing.destination = vessel.destination;
    }

    if (vessel.imo !== undefined) {
      existing.imo = vessel.imo;
    }

    if (vessel.shipType !== undefined) {
      existing.shipType = vessel.shipType;
    }

    /**
     * ========================================================
     * POSITION
     * ========================================================
     *
     * JANGAN PERNAH melakukan:
     *
     * existing.lat = vessel.lat;
     * existing.lon = vessel.lon;
     * existing.sog = vessel.sog;
     * existing.cog = vessel.cog;
     * existing.hdg = vessel.hdg;
     * existing.navStatus = vessel.navStatus;
     *
     * Karena Type 5 tidak membawa position.
     *
     * Position yang berasal dari Type 1/2/3/18/19
     * harus tetap dipertahankan.
     */

    /**
     * ========================================================
     * RECEIVER
     * ========================================================
     */

    if (vessel.receiverId !== undefined) {
      existing.receiverId = vessel.receiverId;
    }

    if (vessel.receiverName !== undefined) {
      existing.receiverName = vessel.receiverName;
    }

    /**
     * ========================================================
     * MESSAGE TYPE
     * ========================================================
     */

    if (vessel.messageType !== undefined) {
      existing.messageType = vessel.messageType;
    }

    /**
     * ========================================================
     * UPDATED AT
     * ========================================================
     */

    existing.updatedAt = new Date();

    this.vessels.set(existing.mmsi, existing);

    return existing;
  }

  /**
   * ============================================================
   * REMOVE UNDEFINED
   * ============================================================
   *
   * Mencegah data undefined menimpa data yang sudah ada.
   */
  private removeUndefined(vessel: Vessel): Vessel {
    const result = {} as Vessel;

    for (const [key, value] of Object.entries(vessel)) {
      if (value !== undefined) {
        (result as unknown as Record<string, unknown>)[key] = value;
      }
    }

    return result;
  }

  /**
   * ============================================================
   * GET
   * ============================================================
   */
  get(mmsi: string): Vessel | undefined {
    return this.vessels.get(mmsi);
  }

  /**
   * ============================================================
   * GET ALL
   * ============================================================
   */
  getAll(): Vessel[] {
    return Array.from(this.vessels.values());
  }

  /**
   * ============================================================
   * VALUES
   * ============================================================
   */
  values(): Vessel[] {
    return Array.from(this.vessels.values());
  }

  /**
   * ============================================================
   * REMOVE
   * ============================================================
   */
  remove(mmsi: string): boolean {
    return this.vessels.delete(mmsi);
  }

  /**
   * ============================================================
   * CLEAR
   * ============================================================
   */
  clear(): void {
    this.vessels.clear();
  }

  /**
   * ============================================================
   * CLEANUP
   * ============================================================
   */
  cleanup(timeoutMinutes = 15): number {
    const now = Date.now();

    let removed = 0;

    for (const [mmsi, vessel] of this.vessels.entries()) {
      if (!vessel.updatedAt) {
        continue;
      }

      const age = now - vessel.updatedAt.getTime();

      if (age >= timeoutMinutes * 60 * 1000) {
        this.vessels.delete(mmsi);
        removed++;
      }
    }

    return removed;
  }

  /**
   * ============================================================
   * SIZE
   * ============================================================
   */
  size(): number {
    return this.vessels.size;
  }

  /**
   * ============================================================
   * HAS
   * ============================================================
   */
  has(mmsi: string): boolean {
    return this.vessels.has(mmsi);
  }
}
