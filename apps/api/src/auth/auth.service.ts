import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { passwordResetHtml } from './password-reset-email';

export interface JwtPayload {
  sub: string;
  tenantId: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  /** Reset links expire after this many minutes. */
  static readonly RESET_TTL_MINUTES = 60;

  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async signup(dto: SignupDto) {
    const role = await this.prisma.role.upsert({
      where: { name: 'admin' },
      update: {},
      create: { name: 'admin', description: 'Tenant administrator', isSystem: true },
    });

    const passwordHash = await argon2.hash(dto.password);

    let tenantId: string;
    let userId: string;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: { slug: dto.tenantSlug, name: dto.tenantName },
        });
        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            roleId: role.id,
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        });
        return { tenantId: tenant.id, userId: user.id };
      });
      tenantId = result.tenantId;
      userId = result.userId;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Tenant slug already taken');
      }
      throw err;
    }

    return this.issueTokens(userId, tenantId, role.name);
  }

  async login(dto: LoginDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
      include: { role: true },
    });
    if (!user) throw new UnauthorizedException();

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user.id, user.tenantId, user.role.name);
  }

  async refresh(userId: string, presentedToken: string | undefined) {
    if (!presentedToken) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user || !user.refreshToken) throw new UnauthorizedException();

    const matches = await argon2.verify(user.refreshToken, presentedToken);
    if (!matches) throw new UnauthorizedException();

    return this.issueTokens(user.id, user.tenantId, user.role.name);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }

  /**
   * Emails a single-use reset link if the account exists. Always resolves the
   * same way, so the endpoint can not be used to discover which emails exist.
   * Only the SHA-256 of the token is stored.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
      select: { id: true, name: true, contactEmail: true },
    });
    if (!tenant) return;
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
      select: { id: true, email: true, firstName: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return;

    const token = randomBytes(32).toString('base64url');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: AuthService.hashToken(token),
        passwordResetExpiresAt: new Date(
          Date.now() + AuthService.RESET_TTL_MINUTES * 60_000,
        ),
      },
    });

    const webOrigin =
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
    await this.email.send(
      [user.email],
      'Restablecer tu contraseña',
      passwordResetHtml({
        firstName: user.firstName,
        academy: tenant.name,
        link: `${webOrigin}/reset-password?token=${token}`,
        minutes: AuthService.RESET_TTL_MINUTES,
      }),
      { fromName: tenant.name, replyTo: tenant.contactEmail },
    );
  }

  /** Sets a new password from a valid reset token and signs out every session. */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { passwordResetTokenHash: AuthService.hashToken(dto.token) },
      select: { id: true, passwordResetExpiresAt: true },
    });
    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt < new Date()
    ) {
      throw new BadRequestException('El enlace no es válido o ha caducado');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(dto.password),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        refreshToken: null,
      },
    });
  }

  /**
   * Changes the signed-in user's password. Rotates the refresh token, so other
   * sessions are signed out while this one continues. A wrong current password
   * is a 400 (not 401) so the client does not treat it as an expired session.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) throw new UnauthorizedException();
    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) throw new BadRequestException('La contraseña actual no es correcta');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await argon2.hash(dto.newPassword),
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    });
    return this.issueTokens(user.id, user.tenantId, user.role.name);
  }

  private async issueTokens(userId: string, tenantId: string, role: string) {
    const payload: JwtPayload = { sub: userId, tenantId, role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    // Unique jti: without it, two tokens issued in the same second are
    // byte-identical, so "rotating" the refresh token would not invalidate the
    // previous one.
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
      jwtid: randomUUID(),
    });

    const refreshHash = await argon2.hash(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: refreshHash },
    });

    return { accessToken, refreshToken };
  }
}
