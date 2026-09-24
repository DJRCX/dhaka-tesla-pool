import { eq, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { driverProfiles, users, vehicles, wallets, zones } from '../../db/schema.js';
import { registerErrorHandler } from '../../lib/error-handler.js';
import { AppError, ErrorCodes } from '../../lib/errors.js';
import { hashPassword, verifyPassword } from './password.js';

const signupBody = z.object({
  name: z.string().min(1).max(80),
  email: z.string().email(),
  phone: z.string().min(5).max(32),
  password: z.string().min(8).max(200),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

/** New passenger TeslaPay balance on sign-up (PRD assumption A13): ৳200.00 */
export const SIGNUP_WALLET_PAISA = 20_000;

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  registerErrorHandler(app);

  app.post(
    '/signup',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
      schema: {
        body: signupBody,
      },
    },
    async (request, reply) => {
      const body = request.body;
      const passwordHash = await hashPassword(body.password);

      try {
        const user = await app.db.transaction(async (tx) => {
          const [created] = await tx
            .insert(users)
            .values({
              role: 'PASSENGER',
              name: body.name,
              email: body.email.toLowerCase(),
              phone: body.phone,
              passwordHash,
            })
            .returning({
              id: users.id,
              name: users.name,
              email: users.email,
              phone: users.phone,
              role: users.role,
            });
          if (!created) throw new AppError(500, ErrorCodes.INTERNAL, 'Failed to create user');

          await tx.insert(wallets).values({
            userId: created.id,
            balancePaisa: SIGNUP_WALLET_PAISA,
          });

          return created;
        });

        await app.setSession(reply, { id: user.id, role: user.role });
        return reply.status(201).send({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: user.role,
          },
        });
      } catch (err) {
        const e = err as {
          cause?: { code?: string; constraint?: string };
          code?: string;
          constraint?: string;
        };
        const code = e.cause?.code ?? e.code;
        const constraint = e.cause?.constraint ?? e.constraint;
        if (code === '23505' && constraint === 'users_email_lower_uidx') {
          throw new AppError(
            409,
            ErrorCodes.EMAIL_TAKEN,
            'An account with this email already exists.',
          );
        }
        throw err;
      }
    },
  );

  app.post(
    '/login',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
      schema: {
        body: loginBody,
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const [user] = await app.db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = lower(${email})`)
        .limit(1);

      const invalid = new AppError(
        401,
        ErrorCodes.UNAUTHENTICATED,
        'Email or password is incorrect',
      );

      if (!user) throw invalid;
      const ok = await verifyPassword(user.passwordHash, password);
      if (!ok) throw invalid;

      await app.setSession(reply, { id: user.id, role: user.role });
      return reply.send({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
        },
      });
    },
  );

  app.post('/logout', async (_request, reply) => {
    app.clearSession(reply);
    return reply.status(204).send();
  });

  app.get(
    '/me',
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const [user] = await app.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, request.user.sub))
        .limit(1);

      if (!user) {
        throw new AppError(401, ErrorCodes.UNAUTHENTICATED, 'Authentication required');
      }

      if (user.role !== 'DRIVER') {
        return reply.send({ user });
      }

      const [profile] = await app.db
        .select({
          isOnline: driverProfiles.isOnline,
          currentZoneId: driverProfiles.currentZoneId,
          zoneSlug: zones.slug,
          zoneName: zones.name,
        })
        .from(driverProfiles)
        .leftJoin(zones, eq(driverProfiles.currentZoneId, zones.id))
        .where(eq(driverProfiles.userId, user.id))
        .limit(1);

      const [vehicle] = await app.db
        .select({
          id: vehicles.id,
          name: vehicles.name,
          plate: vehicles.plate,
          capacity: vehicles.capacity,
        })
        .from(vehicles)
        .where(eq(vehicles.driverId, user.id))
        .limit(1);

      return reply.send({
        user,
        driver: {
          isOnline: profile?.isOnline ?? false,
          currentZone: profile?.currentZoneId
            ? {
                id: profile.currentZoneId,
                slug: profile.zoneSlug,
                name: profile.zoneName,
              }
            : null,
          vehicle: vehicle ?? null,
        },
      });
    },
  );
};
