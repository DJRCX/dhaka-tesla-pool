import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { zoneDistances, zones } from '../../db/schema.js';

export type CachedZone = {
  id: number;
  slug: string;
  name: string;
  lat: string;
  lng: string;
};

export class ZoneCache {
  readonly zones: CachedZone[];
  private readonly byId: Map<number, CachedZone>;
  private readonly bySlug: Map<string, CachedZone>;
  private readonly distances: Map<string, number>;

  private constructor(
    zonesList: CachedZone[],
    distances: Map<string, number>,
  ) {
    this.zones = zonesList;
    this.byId = new Map(zonesList.map((z) => [z.id, z]));
    this.bySlug = new Map(zonesList.map((z) => [z.slug, z]));
    this.distances = distances;
  }

  static async load(db: Db): Promise<ZoneCache> {
    const zoneRows = await db
      .select({
        id: zones.id,
        slug: zones.slug,
        name: zones.name,
        lat: zones.lat,
        lng: zones.lng,
      })
      .from(zones)
      .orderBy(zones.id);

    const distanceRows = await db
      .select({
        fromZoneId: zoneDistances.fromZoneId,
        toZoneId: zoneDistances.toZoneId,
        distanceM: zoneDistances.distanceM,
      })
      .from(zoneDistances);

    const distances = new Map<string, number>();
    for (const row of distanceRows) {
      distances.set(`${row.fromZoneId}:${row.toZoneId}`, row.distanceM);
    }

    return new ZoneCache(zoneRows, distances);
  }

  getById(id: number): CachedZone | undefined {
    return this.byId.get(id);
  }

  getBySlug(slug: string): CachedZone | undefined {
    return this.bySlug.get(slug);
  }

  getDistanceM(fromZoneId: number, toZoneId: number): number | undefined {
    return this.distances.get(`${fromZoneId}:${toZoneId}`);
  }
}

/** Lookup a directed distance row (for tests / one-offs outside the cache). */
export async function lookupDistanceM(
  db: Db,
  fromZoneId: number,
  toZoneId: number,
): Promise<number | undefined> {
  const [row] = await db
    .select({ distanceM: zoneDistances.distanceM })
    .from(zoneDistances)
    .where(
      and(
        eq(zoneDistances.fromZoneId, fromZoneId),
        eq(zoneDistances.toZoneId, toZoneId),
      ),
    )
    .limit(1);
  return row?.distanceM;
}
