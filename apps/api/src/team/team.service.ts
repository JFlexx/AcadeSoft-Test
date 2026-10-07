import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';

/** Back-office users: the admins and the front office (role "staff"). */
@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, me: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, role: { name: { in: ['admin', 'staff'] } } },
      orderBy: [{ role: { name: 'asc' } }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        lastLoginAt: true,
        role: { select: { name: true } },
      },
    });
    return users.map(({ role, ...u }) => ({ ...u, role: role.name, isMe: u.id === me }));
  }

  async create(tenantId: string, dto: CreateStaffDto) {
    const email = dto.email.trim().toLowerCase();
    const taken = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
      select: { id: true },
    });
    if (taken) throw new ConflictException('Ese email ya lo usa otro usuario de la academia');
    const role = await this.prisma.role.upsert({
      where: { name: 'staff' },
      update: {},
      create: { name: 'staff', description: 'Secretaría', isSystem: true },
    });
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        roleId: role.id,
        email,
        passwordHash: await argon2.hash(dto.password),
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
    return { ...user, role: 'staff' };
  }

  /** Removes a front-office user. Admins (and yourself) can't be removed here. */
  async remove(tenantId: string, me: string, id: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { id: true, role: { select: { name: true } } },
    });
    if (!user) throw new NotFoundException();
    if (user.id === me) throw new BadRequestException('No puedes eliminar tu propio usuario');
    if (user.role.name !== 'staff') {
      throw new BadRequestException('Solo se pueden eliminar usuarios de secretaría');
    }
    await this.prisma.user.delete({ where: { id } });
  }
}
