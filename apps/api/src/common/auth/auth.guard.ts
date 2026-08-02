/**
 * AuthGuard — guard 1/5 (ADR-025 chain). Establishes the PRINCIPAL for every
 * protected request and patches RequestContext { principal, userId }.
 *
 * Modes (docs/API.md §1): (a) Bearer session JWT (first-party), (b) X-API-Key.
 * Both hit Postgres (user / api_keys rows) — verification is always against
 * CURRENT state (revocation is immediate, no cache window).
 *
 * Public routes opt OUT explicitly via @Public() (health/metrics/docs, SSO
 * starts, webhook receivers). Everything else is authenticated by default.
 */
import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '@aca/config';
import type { DbClient } from '@aca/database';
import { apiErrors } from '../errors/api-error.js';
import { patchRequestContext, type Principal } from '../context/request-context.js';
import { verifySessionJwt } from './session-jwt.js';
import { parseApiKey } from './api-key.js';
import { PRISMA } from '../prisma.provider.js';
import { API_CONFIG } from '../redis.provider.js';

export const IS_PUBLIC_KEY = 'aca:is-public';
/** Opts a route OUT of authentication (everything is authenticated by default). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

const BEARER_REGEX = /^Bearer ([A-Za-z0-9._~+/=-]+)$/;

/** Pure authn decision over loaded records (unit-tested directly). */
export function decideUserAdmission(status: string): void {
  if (status === 'SUSPENDED') throw apiErrors.forbidden('account suspended');
  if (status === 'DELETED') throw apiErrors.forbidden('account deleted');
  if (status !== 'ACTIVE') throw apiErrors.unauthenticated('account not active');
}

/** Pure api-key admission over a loaded row (unit-tested directly). */
export function decideApiKeyAdmission(row: { status: string; revokedAt: Date | null; expiresAt: Date | null }, now: Date): void {
  if (row.status !== 'ACTIVE' || row.revokedAt !== null) {
    throw apiErrors.unauthenticated('api key revoked');
  }
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
    throw apiErrors.unauthenticated('api key expired');
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    @Inject(PRISMA) private readonly prisma: DbClient,
    @Inject(API_CONFIG) config: AppConfig,
  ) {
    // fail CLOSED at bootstrap: no secret, no verified sessions, no app
    if (config.auth.jwtSecret === undefined) {
      throw new Error('AUTH_JWT_SECRET is required to boot apps/api (ADR-025)');
    }
    this.jwtSecret = config.auth.jwtSecret;
    this.issuer = config.auth.jwtIssuer;
    this.audience = config.auth.jwtAudience;
  }

  private readonly issuer: string;
  private readonly audience: string;

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const authorization = req.headers.authorization;
    const apiKeyHeader = req.headers['x-api-key'];

    if (typeof authorization === 'string') return this.authenticateJwt(authorization);
    if (typeof apiKeyHeader === 'string') return this.authenticateApiKey(apiKeyHeader);
    throw apiErrors.unauthenticated();
  }

  private async authenticateJwt(authorization: string): Promise<boolean> {
    const match = BEARER_REGEX.exec(authorization);
    if (match === null) throw apiErrors.unauthenticated('malformed authorization header');
    const claims = verifySessionJwt(match[1] as string, this.jwtSecret, {
      issuer: this.issuer,
      audience: this.audience,
    });
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, status: true },
    });
    if (user === null) throw apiErrors.unauthenticated('unknown user');
    decideUserAdmission(user.status);
    const principal: Principal = { kind: 'user', userId: user.id, sessionId: claims.sid ?? null };
    patchRequestContext({ principal, userId: user.id });
    return true;
  }

  private async authenticateApiKey(raw: string): Promise<boolean> {
    const parsed = parseApiKey(raw);
    const row = await this.prisma.apiKey.findUnique({
      where: { keyHash: parsed.keyHash },
      select: { id: true, orgId: true, scopes: true, status: true, revokedAt: true, expiresAt: true, prefix: true },
    });
    if (row === null) throw apiErrors.unauthenticated('unknown api key');
    decideApiKeyAdmission(row, new Date());
    if (row.prefix !== parsed.prefix) {
      // hash matched but display prefix did not — impossible unless the key was re-generated;
      // treat as revoked (paranoid consistency check, costs nothing)
      throw apiErrors.unauthenticated('api key prefix mismatch');
    }
    await this.prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
    const principal: Principal = {
      kind: 'apikey',
      apiKeyId: row.id,
      orgId: row.orgId,
      scopes: row.scopes,
    };
    patchRequestContext({ principal });
    return true;
  }
}
