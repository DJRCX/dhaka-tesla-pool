import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fjwt from '@fastify/jwt';
import type { UserRole } from '@teslapool/shared';
import { AppError, ErrorCodes } from '../../lib/errors.js';

export type SessionUser = {
  sub: string;
  role: UserRole;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      role: UserRole,
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    setSession: (reply: FastifyReply, user: { id: string; role: UserRole }) => Promise<void>;
    clearSession: (reply: FastifyReply) => void;
  }
}

async function authPlugin(app: FastifyInstance) {
  await app.register(fjwt, {
    secret: app.appConfig.JWT_SECRET,
    cookie: {
      cookieName: 'dtp_session',
      signed: false,
    },
  });

  app.decorate('setSession', async (reply, user) => {
    const token = await reply.jwtSign(
      { sub: user.id, role: user.role },
      { expiresIn: '7d' },
    );
    reply.setCookie('dtp_session', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  });

  app.decorate('clearSession', (reply) => {
    reply.clearCookie('dtp_session', { path: '/' });
  });

  app.decorate('authenticate', async (request, _reply) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError(401, ErrorCodes.UNAUTHENTICATED, 'Authentication required');
    }
  });

  app.decorate('requireRole', (role: UserRole) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(request, reply);
      if (request.user.role !== role) {
        throw new AppError(403, ErrorCodes.FORBIDDEN, 'You do not have access to this resource');
      }
    };
  });
}

export default fp(authPlugin, { name: 'auth-plugin' });
