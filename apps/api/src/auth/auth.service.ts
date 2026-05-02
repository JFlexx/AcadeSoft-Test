import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

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
  ) {}

  async register(dto: RegisterDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: dto.tenantSlug } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
    if (!role) throw new NotFoundException('Role not found');

    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
    });
    if (existing) throw new ConflictException('Email already registered for this tenant');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        roleId: role.id,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    return this.issueTokens(user.id, tenant.id, role.name);
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

  private async issueTokens(userId: string, tenantId: string, role: string) {
    const payload: JwtPayload = { sub: userId, tenantId, role };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
    });

    const refreshHash = await argon2.hash(refreshToken);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: refreshHash },
    });

    return { accessToken, refreshToken };
  }
}
