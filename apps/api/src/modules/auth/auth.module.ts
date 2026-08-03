/**
 * AuthModule — /v1/auth surface. Platform providers (PRISMA, API_CONFIG)
 * come from the global CommonModule; all credential logic lives in @aca/auth.
 */
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { authServiceProvider } from './auth.providers.js';

@Module({
  controllers: [AuthController],
  providers: [authServiceProvider],
  exports: [authServiceProvider],
})
export class AuthModule {}
