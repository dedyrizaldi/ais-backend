import { NormalizedNmea } from '../interfaces/normalized-nmea.interface';

export class NmeaNormalizer {
  static normalize(raw: string): NormalizedNmea {
    let clean = raw.trim();

    // hilangkan metadata sebelum ! atau $
    const idxBang = clean.indexOf('!');
    const idxDollar = clean.indexOf('$');

    if (idxBang >= 0 || idxDollar >= 0) {
      let idx = -1;

      if (idxBang >= 0 && idxDollar >= 0) {
        idx = Math.min(idxBang, idxDollar);
      } else {
        idx = Math.max(idxBang, idxDollar);
      }

      clean = clean.substring(idx);
    }

    const sentence = clean.substring(0, 6);

    const isAIS =
      clean.startsWith('!AIVDM') ||
      clean.startsWith('!AIVDO') ||
      clean.startsWith('!ABVDM') ||
      clean.startsWith('!ABVDO') ||
      clean.startsWith('!BSVDM') ||
      clean.startsWith('!BSVDO');

    const isGPS =
      clean.startsWith('$GP') ||
      clean.startsWith('$GN') ||
      clean.startsWith('$GA') ||
      clean.startsWith('$GQ') ||
      clean.startsWith('$BD');

    const isAlarm =
      clean.startsWith('$ABALR') ||
      clean.startsWith('$ABADS') ||
      clean.startsWith('$ABCAB');

    return {
      raw,
      clean,
      sentence,
      isAIS,
      isGPS,
      isAlarm,
      isUnknown: !(isAIS || isGPS || isAlarm),
    };
  }
}
