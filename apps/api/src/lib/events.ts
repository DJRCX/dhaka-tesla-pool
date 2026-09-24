import type { Db } from '../db/client.js';
import { rideEvents } from '../db/schema.js';

export type RecordEventInput = {
  rideRequestId?: string | null;
  poolId?: string | null;
  actorUserId?: string | null;
  type: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  data?: unknown;
};

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export async function recordEvent(
  tx: Tx | Db,
  input: RecordEventInput,
  log?: { info: (obj: object, msg?: string) => void },
): Promise<void> {
  await tx.insert(rideEvents).values({
    rideRequestId: input.rideRequestId ?? null,
    poolId: input.poolId ?? null,
    actorUserId: input.actorUserId ?? null,
    type: input.type,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    data: input.data ?? null,
  });
  log?.info(
    {
      eventType: input.type,
      rideRequestId: input.rideRequestId,
      poolId: input.poolId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
    },
    'domain event recorded',
  );
}
