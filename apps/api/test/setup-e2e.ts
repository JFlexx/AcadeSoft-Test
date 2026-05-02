import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export async function bootstrapTestApp(): Promise<{
  app: INestApplication;
  prisma: PrismaService;
}> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export type SeededTenant = {
  tenantId: string;
  tenantSlug: string;
  adminEmail: string;
  adminPassword: string;
};

export async function seedTenant(
  prisma: PrismaService,
  opts: { slug: string; email: string; password: string; roleName?: string },
): Promise<SeededTenant> {
  const roleName = opts.roleName ?? 'admin';
  const role = await prisma.role.upsert({
    where: { name: roleName },
    update: {},
    create: { name: roleName, isSystem: true },
  });
  const tenant = await prisma.tenant.create({
    data: { slug: opts.slug, name: opts.slug },
  });
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      roleId: role.id,
      email: opts.email,
      passwordHash: await argon2.hash(opts.password),
      firstName: 'Admin',
      lastName: opts.slug,
    },
  });
  return {
    tenantId: tenant.id,
    tenantSlug: opts.slug,
    adminEmail: opts.email,
    adminPassword: opts.password,
  };
}
