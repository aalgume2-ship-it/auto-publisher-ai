/**
 * AuthController — /v1/auth surface (Roadmap Phase-0 "Auth complete").
 * Thin pass-through to the framework-free @aca/auth core; ALL auth logic
 * lives in the package (unit-tested without Nest). Public routes are
 * rate-limited by the global guard chain like every other public route.
 */
import { Body, Controller, HttpCode, Inject, Logger, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthService } from '@aca/auth';
import { Public } from '../../common/auth/auth.guard.js';
import { requestContext } from '../../common/context/request-context.js';
import { UseZod } from '../../common/validation/zod-validation.pipe.js';
import { PROBLEM } from '../../common/http/problem-details.openapi.js';
import { OrganizationsService, type OrganizationDto } from '../organizations/organizations.service.js';
import { AUTH_SERVICE } from './auth.providers.js';
import { withAuthErrorMapping } from './auth-error-map.js';
import {
  ChangePasswordBody,
  LoginBody,
  LoginBodyDoc,
  LoginResultDoc,
  LogoutBody,
  MfaCompleteBody,
  RefreshBody,
  RegisterBody,
  RegisterBodyDoc,
  TokensDoc,
  TotpConfirmBody,
  TotpDisableBody,
  TotpEnrollDoc,
} from './auth.dto.js';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
@ApiUnauthorizedResponse({ description: 'Invalid credentials / expired or reused token', content: { 'application/problem+json': { schema: PROBLEM } } })
@ApiTooManyRequestsResponse({ description: 'Rate limit exceeded', content: { 'application/problem+json': { schema: PROBLEM } } })
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(AUTH_SERVICE) private readonly auth: AuthService,
    private readonly organizations: OrganizationsService,
  ) {}

  /** Human-friendly default workspace name derived from the operator's display name. */
  private defaultWorkspaceName(displayName: string): string {
    const base = displayName.trim();
    return base.length > 0 ? `${base} Studio` : 'My Studio';
  }

  private requestMeta(): { ip: string; userAgent: string | null } {
    const ctx = requestContext();
    return { ip: ctx.ip, userAgent: ctx.userAgent };
  }

  @Public()
  @Post('register')
  @HttpCode(201)
  @UseZod({ body: RegisterBody })
  @ApiOperation({ operationId: 'register', summary: 'Create an account (email/password) — session issued immediately, a default workspace + settings are provisioned in the background' })
  @ApiBody({ schema: RegisterBodyDoc })
  @ApiCreatedResponse({
    description: 'Account created',
    schema: {
      type: 'object',
      properties: {
        user: { $ref: '#/components/schemas/AuthUser' },
        tokens: TokensDoc,
        workspace: {
          type: 'object',
          nullable: true,
          properties: { id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' } },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Weak password / validation failed', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiConflictResponse({ description: 'Email already registered', content: { 'application/problem+json': { schema: PROBLEM } } })
  async register(@Body() body: RegisterBody) {
    return withAuthErrorMapping(async (): Promise<{
      user: { id: string; email: string; displayName: string };
      tokens: import('@aca/auth').IssuedTokens;
      workspace?: OrganizationDto;
    }> => {
      const result = await this.auth.register(body, this.requestMeta());
      let workspace: OrganizationDto | undefined;
      try {
        // Auto-provision the operator's first workspace (Organization) with
        // sensible defaults so they land straight into a ready dashboard.
        // Best-effort by design: a provisioning hiccup must never fail the
        // whole registration — the dashboard offers manual creation if needed.
        workspace = await this.organizations.createOrganization(
          { kind: 'user', userId: result.user.id },
          {
            name: this.defaultWorkspaceName(result.user.displayName),
            timezone: body.timezone,
            defaultLocale: body.locale,
          },
        );
      } catch (err) {
        this.logger.warn(`workspace auto-provision failed for user ${result.user.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
      return { user: result.user, tokens: result.tokens, ...(workspace !== undefined ? { workspace } : {}) };
    });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseZod({ body: LoginBody })
  @ApiOperation({ operationId: 'login', summary: 'Email/password sign-in — returns tokens or an MFA ticket' })
  @ApiBody({ schema: LoginBodyDoc })
  @ApiOkResponse({ description: 'Tokens OR mfa_required + ticket (5 min)', schema: LoginResultDoc })
  login(@Body() body: LoginBody) {
    const { deviceName, ...cred } = body;
    return withAuthErrorMapping(() =>
      this.auth.login(cred.email, cred.password, { ...this.requestMeta(), ...(deviceName !== undefined ? { deviceName } : {}) }),
    );
  }

  @Public()
  @Post('mfa/complete')
  @HttpCode(200)
  @UseZod({ body: MfaCompleteBody })
  @ApiOperation({ operationId: 'completeMfaLogin', summary: 'Finish an MFA-gated login (mfaTicket + authenticator code)' })
  @ApiOkResponse({ description: 'Tokens', schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/AuthUser' }, tokens: TokensDoc } } })
  completeMfa(@Body() body: MfaCompleteBody) {
    const { deviceName, ...rest } = body;
    return withAuthErrorMapping(() =>
      this.auth.completeMfaLogin(rest.mfaTicket, rest.code, { ...this.requestMeta(), ...(deviceName !== undefined ? { deviceName } : {}) }),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @UseZod({ body: RefreshBody })
  @ApiOperation({
    operationId: 'refreshSession',
    summary: 'Rotate refresh token (Okta-style): old hash kept in a 45 s retry-safe grace window; out-of-grace reuse revokes the session',
  })
  @ApiOkResponse({ description: 'Rotated token pair', schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/AuthUser' }, tokens: TokensDoc } } })
  refresh(@Body() body: RefreshBody) {
    return withAuthErrorMapping(() => this.auth.refresh(body.refreshToken, this.requestMeta()));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @UseZod({ body: LogoutBody })
  @ApiOperation({ operationId: 'logout', summary: 'Revoke a refresh token/session (idempotent, unknown token = success)' })
  @ApiNoContentResponse({ description: 'Revoked (or already unknown)' })
  async logout(@Body() body: LogoutBody): Promise<void> {
    await withAuthErrorMapping(() => this.auth.logout(body.refreshToken));
  }

  @Post('password/change')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseZod({ body: ChangePasswordBody })
  @ApiOperation({ operationId: 'changePassword', summary: 'Change password — revokes ALL existing sessions, returns a fresh pair' })
  @ApiOkResponse({ description: 'Fresh tokens on the new session', schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/AuthUser' }, tokens: TokensDoc } } })
  changePassword(@Body() body: ChangePasswordBody) {
    const userId = requestContext().userId;
    return withAuthErrorMapping(() => this.auth.changePassword(userId!, body.oldPassword, body.newPassword, this.requestMeta()));
  }

  @Post('totp/enroll')
  @HttpCode(201)
  @ApiBearerAuth()
  @ApiOperation({ operationId: 'startTotpEnrollment', summary: 'Begin MFA enrollment — secret returned ONCE (also encrypted at rest)' })
  @ApiCreatedResponse({ description: 'Base32 secret + otpauth URI (render as QR)', schema: TotpEnrollDoc })
  @ApiConflictResponse({ description: 'Authenticator already enabled', content: { 'application/problem+json': { schema: PROBLEM } } })
  @ApiServiceUnavailableResponse({ description: 'MFA not configured on this deployment', content: { 'application/problem+json': { schema: PROBLEM } } })
  enrollTotp() {
    const userId = requestContext().userId;
    return withAuthErrorMapping(() => this.auth.startTotpEnrollment(userId!));
  }

  @Post('totp/confirm')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseZod({ body: TotpConfirmBody })
  @ApiOperation({ operationId: 'confirmTotpEnrollment', summary: 'Arm MFA with the first valid authenticator code' })
  @ApiOkResponse({ description: 'MFA enabled', schema: { type: 'object', properties: { mfaEnabled: { type: 'boolean', example: true } } } })
  async confirmTotp(@Body() body: TotpConfirmBody): Promise<{ mfaEnabled: true }> {
    const userId = requestContext().userId;
    await withAuthErrorMapping(() => this.auth.confirmTotpEnrollment(userId!, body.code));
    return { mfaEnabled: true };
  }

  @Post('totp/disable')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseZod({ body: TotpDisableBody })
  @ApiOperation({ operationId: 'disableTotp', summary: 'Disable MFA (requires current password)' })
  @ApiOkResponse({ description: 'MFA disabled', schema: { type: 'object', properties: { mfaEnabled: { type: 'boolean', example: false } } } })
  async disableTotp(@Body() body: TotpDisableBody): Promise<{ mfaEnabled: false }> {
    const userId = requestContext().userId;
    await withAuthErrorMapping(() => this.auth.disableTotp(userId!, body.password));
    return { mfaEnabled: false };
  }
}
