import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? 'acme';
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Academia Acme';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@acme.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const roles = await Promise.all(
    (
      [
        { name: 'admin', description: 'Tenant administrator' },
        { name: 'teacher', description: 'Teacher' },
        { name: 'student', description: 'Student' },
        { name: 'guardian', description: 'Family/guardian portal' },
      ] as const
    ).map((r) =>
      prisma.role.upsert({
        where: { name: r.name },
        update: {},
        create: { name: r.name, description: r.description, isSystem: true },
      }),
    ),
  );
  const adminRole = roles.find((r) => r.name === 'admin')!;

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: { slug: tenantSlug, name: tenantName },
  });

  const passwordHash = await argon2.hash(adminPassword);
  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: {},
    create: {
      tenantId: tenant.id,
      roleId: adminRole.id,
      email: adminEmail,
      passwordHash,
      firstName: 'Admin',
      lastName: tenantName,
    },
  });

  console.log('Seed OK');
  console.log(`  roles:  ${roles.map((r) => r.name).join(', ')}`);
  console.log(`  tenant: ${tenant.slug} (${tenant.name})`);
  console.log(`  admin:  ${admin.email} / ${adminPassword}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
