export interface NormalizedNmea {
  raw: string;

  clean: string;

  sentence: string;

  isAIS: boolean;

  isGPS: boolean;

  isAlarm: boolean;

  isUnknown: boolean;
}
