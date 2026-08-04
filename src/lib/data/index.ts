/**
 * The single seam between the product and its data.
 *
 * Server components call `getDataProvider()`. Nothing else in the codebase
 * imports `sim.ts` or `live.ts`, so P1 is a change to this file and nowhere
 * else.
 */

import { LiveProvider } from "@/lib/data/live";
import { SimProvider } from "@/lib/data/sim";
import type { DataProvider, DataSource } from "@/lib/data/types";

function readSource(): DataSource {
  const raw = (process.env.DATA_SOURCE ?? "sim").trim().toLowerCase();
  if (raw === "sim" || raw === "live") return raw;
  throw new Error(`DATA_SOURCE must be "sim" or "live", got "${raw}".`);
}

function readSeed(): number | undefined {
  const raw = process.env.SIM_SEED;
  if (!raw) return undefined;
  const seed = Number.parseInt(raw, 10);
  if (!Number.isFinite(seed)) throw new Error(`SIM_SEED must be an integer, got "${raw}".`);
  return seed;
}

let cached: DataProvider | undefined;

export function getDataProvider(): DataProvider {
  if (!cached) {
    cached = readSource() === "live" ? new LiveProvider() : new SimProvider({ seed: readSeed() });
  }
  return cached;
}

export type { DataProvider, DataSource };
