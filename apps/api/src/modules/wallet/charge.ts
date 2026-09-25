import { eq, sql } from 'drizzle-orm';
import type { PaymentMethod } from '@teslapool/shared';
import { wallets, walletTransactions } from '../../db/schema.js';
import { recordEvent } from '../../lib/events.js';
import { AppError, ErrorCodes, extractPgError, mapPostgresError } from '../../lib/errors.js';

type Tx = Parameters<
  Parameters<import('../../db/client.js').Db['transaction']>[0]
>[0];

export type ChargeMemberInput = {
  userId: string;
  rideRequestId: string;
  poolId: string;
  farePaisa: number;
  paymentMethod: PaymentMethod;
  actorUserId: string;
};

/**
 * Debit TeslaPay or record cash due. Idempotent per ride via
 * `wallet_tx_one_charge_per_ride` for WALLET charges.
 */
export async function settleMemberPayment(
  tx: Tx,
  input: ChargeMemberInput,
  log?: { info: (obj: object, msg?: string) => void },
): Promise<void> {
  if (input.paymentMethod === 'CASH') {
    await recordEvent(
      tx,
      {
        rideRequestId: input.rideRequestId,
        poolId: input.poolId,
        actorUserId: input.actorUserId,
        type: 'CASH_DUE_RECORDED',
        data: { amountPaisa: input.farePaisa },
      },
      log,
    );
    return;
  }

  try {
    const [updated] = await tx
      .update(wallets)
      .set({
        balancePaisa: sql`${wallets.balancePaisa} - ${input.farePaisa}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.userId, input.userId))
      .returning({ balancePaisa: wallets.balancePaisa });

    if (!updated) {
      throw new AppError(404, ErrorCodes.NOT_FOUND, 'Wallet not found');
    }

    await tx.insert(walletTransactions).values({
      userId: input.userId,
      rideRequestId: input.rideRequestId,
      type: 'RIDE_CHARGE',
      amountPaisa: -input.farePaisa,
      balanceAfterPaisa: updated.balancePaisa,
    });

    await recordEvent(
      tx,
      {
        rideRequestId: input.rideRequestId,
        poolId: input.poolId,
        actorUserId: input.actorUserId,
        type: 'PAYMENT_CAPTURED',
        data: {
          amountPaisa: input.farePaisa,
          balanceAfterPaisa: updated.balancePaisa,
        },
      },
      log,
    );
  } catch (err) {
    if (err instanceof AppError) throw err;
    const pg = extractPgError(err);
    if (pg) {
      const mapped = mapPostgresError(pg);
      if (mapped) throw mapped;
    }
    throw err;
  }
}
