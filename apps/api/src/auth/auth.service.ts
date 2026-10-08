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
  /** The signed-in device (AuthSession id). */
  sid?: string;
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

  /** How long a just-replaced refresh token is still accepted (two tabs at once). */
  static readonly ROTATION_GRACE_MS = 30_000;

  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async signup(dto: SignupDto, userAgent?: string) {
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
          data: { slug: dto.tenantSlug, name: dto.tenantName, termsAcceptedAt: new Date() },
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

    return this.startSession(userId, tenantId, role.name, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string) {
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

    return this.startSession(user.id, user.tenantId, user.role.name, userAgent);
  }

  /**
   * Rotates this device's refresh token (standard rotation with reuse
   * detection). The token it replaced stays valid for a few seconds without
   * rotating again, so two tabs refreshing at once both get through; it then
   * returns no refresh token and the browser keeps the newer cookie. Any
   * older token showing up later means it was copied: the session ends.
   */
  async refresh(
    userId: string,
    sessionId: string | undefined,
    presentedToken: string | undefined,
  ): Promise<{ accessToken: string; refreshToken: string | null }> {
    if (!presentedToken || !sessionId) throw new UnauthorizedException();
    const hash = AuthService.hashToken(presentedToken);
    const now = new Date();

    const load = () =>
      this.prisma.authSession.findUnique({
        where: { id: sessionId },
        include: { user: { include: { role: true } } },
      });
    let session = await load();
    if (!session || session.userId !== userId || session.expiresAt <= now) {
      throw new UnauthorizedException();
    }
    const { user } = session;

    if (session.tokenHash === hash) {
      const tokens = await this.signTokens(user.id, user.tenantId, user.role.name, session.id);
      // Compare-and-swap: only one of two simultaneous refreshes rotates.
      const { count } = await this.prisma.authSession.updateMany({
        where: { id: session.id, tokenHash: hash },
        data: {
          tokenHash: AuthService.hashToken(tokens.refreshToken),
          previousHash: hash,
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt: this.expiryOf(tokens.refreshToken),
        },
      });
      if (count === 1) return tokens;
      session = await load();
      if (!session) throw new UnauthorizedException();
    }

    const justRotated =
      session.previousHash === hash &&
      session.rotatedAt !== null &&
      now.getTime() - session.rotatedAt.getTime() <= AuthService.ROTATION_GRACE_MS;
    if (justRotated) {
      const { accessToken } = await this.signTokens(
        user.id,
        user.tenantId,
        user.role.name,
        session.id,
      );
      return { accessToken, refreshToken: null };
    }

    await this.prisma.authSession.deleteMany({ where: { id: session.id } });
    throw new UnauthorizedException();
  }

  /** Signs out this device only. */
  async logout(userId: string, sessionId: string | undefined) {
    if (!sessionId) return;
    await this.prisma.authSession.deleteMany({ where: { id: sessionId, userId } });
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
        sessions: { deleteMany: {} },
      },
    });
  }

  /**
   * Changes the signed-in user's password. Every device is signed out and this
   * one gets a fresh session, so it continues. A wrong current password is a
   * 400 (not 401) so the client does not treat it as an expired session.
   */
  async changePassword(userId: string, dto: ChangePasswordDto, userAgent?: string) {
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
        sessions: { deleteMany: {} },
      },
    });
    return this.startSession(user.id, user.tenantId, user.role.name, userAgent);
  }

  /** A new signed-in device: its own session row and tokens. */
  private async startSession(userId: string, tenantId: string, role: string, userAgent?: string) {
    const now = new Date();
    // Expired sessions of this user are no longer useful to anyone.
    await this.prisma.authSession.deleteMany({ where: { userId, expiresAt: { lte: now } } });
    const sessionId = randomUUID();
    const tokens = await this.signTokens(userId, tenantId, role, sessionId);
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId,
        tokenHash: AuthService.hashToken(tokens.refreshToken),
        expiresAt: this.expiryOf(tokens.refreshToken),
        userAgent: userAgent?.slice(0, 300) ?? null,
      },
    });
    return tokens;
  }

  /** When a signed token expires (its `exp` claim). */
  private expiryOf(token: string): Date {
    const { exp } = this.jwt.decode(token) as { exp: number };
    return new Date(exp * 1000);
  }

  private async signTokens(userId: string, tenantId: string, role: string, sessionId: string) {
    const payload: JwtPayload = { sub: userId, tenantId, role, sid: sessionId };

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

    return { accessToken, refreshToken };
  }
}
