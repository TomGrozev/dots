const readPositiveNumber = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const REGION_API_BASES = {
  us: "https://api.soniox.com/v1",
  eu: "https://api.eu.soniox.com/v1",
  jp: "https://api.jp.soniox.com/v1",
  in: "https://api.in.soniox.com/v1",
} as const;

export type SonioxRegion = keyof typeof REGION_API_BASES;

const isRegion = (value: string): value is SonioxRegion =>
  Object.prototype.hasOwnProperty.call(REGION_API_BASES, value);

const readRegion = (): SonioxRegion => {
  const raw = (process.env.SONIOX_REGION ?? "us").trim().toLowerCase();
  const region = raw === "" ? "us" : raw;
  if (!isRegion(region)) {
    throw new Error(
      `SONIOX_REGION must be one of ${Object.keys(REGION_API_BASES).join(", ")}; got "${raw}"`,
    );
  }
  return region;
};

const region = readRegion();
// An explicit base wins, so tests and custom gateways can bypass the map.
const apiBase = process.env.SONIOX_API_BASE?.trim() || REGION_API_BASES[region];

export const config = {
  PORT: readPositiveNumber("PORT", 8788),
  HOST: process.env.HOST ?? "127.0.0.1",
  SONIOX_REGION: region,
  SONIOX_API_BASE: apiBase.replace(/\/+$/, ""),
  SONIOX_MODEL: process.env.SONIOX_MODEL ?? "stt-async-v5",
  POLL_INTERVAL_MS: readPositiveNumber("POLL_INTERVAL_MS", 200),
  POLL_TIMEOUT_MS: readPositiveNumber("POLL_TIMEOUT_MS", 300_000),
  MAX_FILE_SIZE_BYTES: readPositiveNumber("MAX_FILE_SIZE_BYTES", 25 * 1024 * 1024),
} as const;

export type Config = typeof config;
