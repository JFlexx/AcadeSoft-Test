import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, tenant: true },
    });
    if (!user) throw new NotFoundException();

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      role: user.role.name,
      tenant: { id: user.tenant.id, slug: user.tenant.slug, name: user.tenant.name },
    };
  }
}
