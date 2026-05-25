import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bootstrapTestApp, resetDb, seedTenant, SeededTenant } from './setup-e2e';
import { buildVerifactuQrUrl } from '../src/invoices/invoice-qr';

describe('Verifactu QR + huella (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let acme: SeededTenant;
  let acmeToken: string;
  let acmeStudentId: string;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    acme = await seedTenant(prisma, {
      slug: 'acme',
      email: 'admin@acme.local',
      password: 'TestPassword123!',
    });
    acmeToken = await login(acme);
    const student = await http()
      .post('/students')
      .set(bearer(acmeToken))
      .send({ firstName: 'Ana', lastName: 'García' })
      .expect(201);
    acmeStudentId = student.body.id;
  });

  function http() {
    return request(app.getHttpServer());
  }

  async function login(t: SeededTenant): Promise<string> {
    const res = await http()
      .post('/auth/login')
      .send({ tenantSlug: t.tenantSlug, email: t.adminEmail, password: t.adminPassword })
      .expect(200);
    return res.body.accessToken;
  }

  function bearer(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  // ─── Pure unit-style coverage of the URL builder ─────────────────────────

  it('buildVerifactuQrUrl produces the AEAT validate URL with DD-MM-YYYY date', () => {
    const url = buildVerifactuQrUrl({
      emitterTaxId: 'B12345678',
      invoiceNumber: 'F-2026-0001',
      issueDate: new Date(Date.UTC(2026, 9, 5, 12, 0, 0)), // Oct 5, 2026 noon UTC
      amount: '50.00',
    });
    expect(url).toBe(
      'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=F-2026-0001&fecha=05-10-2026&importe=50.00',
    );
  });

  it('buildVerifactuQrUrl URL-encodes special characters in invoice number', () => {
    const url = buildVerifactuQrUrl({
      emitterTaxId: 'B12345678',
      invoiceNumber: 'F/2026/0001',
      issueDate: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)),
      amount: '10.50',
    });
    expect(url).toContain('numserie=F%2F2026%2F0001');
  });

  // ─── PDF growth: the verification block adds real content ────────────────

  it('PDF for a hashed invoice embeds a QR image (PDF grows noticeably)', async () => {
    const inv = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({
        studentId: acmeStudentId,
        amount: 50,
        description: 'Concepto QR',
      })
      .expect(201);

    const res = await http()
      .get(`/invoices/${inv.body.id}/pdf`)
      .set(bearer(acmeToken))
      .buffer(true)
      .parse((response, cb) => {
        const chunks: Buffer[] = [];
        response.on('data', (c: Buffer) => chunks.push(c));
        response.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
    // Without the QR the PDF was ~2.8KB. The embedded PNG + URL push it well
    // past 3.5KB; any sizable drop would mean we accidentally regressed the QR.
    expect(res.body.length).toBeGreaterThan(3500);
  });

  it('rejects PDF for an invoice from another tenant', async () => {
    // Sanity: the QR PDF flow doesn't accidentally leak cross-tenant.
    const inv = await http()
      .post('/invoices')
      .set(bearer(acmeToken))
      .send({ studentId: acmeStudentId, amount: 50 })
      .expect(201);

    const beta = await seedTenant(prisma, {
      slug: 'beta',
      email: 'admin@beta.local',
      password: 'TestPassword123!',
    });
    const betaToken = await login(beta);

    await http()
      .get(`/invoices/${inv.body.id}/pdf`)
      .set(bearer(betaToken))
      .expect(404);
  });
});
