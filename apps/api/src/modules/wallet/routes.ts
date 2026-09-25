import { desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { wallets, walletTransactions } from '../../db/schema.js';
import { registerErrorHandler } from '../../lib/error-handler.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';

export const walletRoutes: FastifyPluginAsyncZod = async (app) => {
  registerErrorHandler(app);
  const requirePassenger = app.requireRole('PASSENGER');

  app.get(
    '/',
    {
      preHandler: [requirePassenger],
    },
    async (request, reply) => {
      const [wallet] = await app.db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, request.user.sub))
        .limit(1);
      if (!wallet) {
        throw new AppError(404, ErrorCodes.NOT_FOUND, 'Wallet not found');
      }

      const transactions = await app.db
        .select({
          id: walletTransactions.id,
          type: walletTransactions.type,
          amountPaisa: walletTransactions.amountPaisa,
          balanceAfterPaisa: walletTransactions.balanceAfterPaisa,
          rideRequestId: walletTransactions.rideRequestId,
          createdAt: walletTransactions.createdAt,
        })
        .from(walletTransactions)
        .where(eq(walletTransactions.userId, request.user.sub))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(20);

      return reply.send({
        balancePaisa: wallet.balancePaisa,
        transactions,
      });
    },
  );
};
