#!/usr/bin/env node
// End-to-end smoke test of the AcadeSoft API.
// Walks the full "vendible" loop: login → settings → student with IBAN →
// course → group with monthly fee → enroll → generate mensualidades →
// partial payment → PDF → SEPA preview → SEPA XML → finish payment →
// re-check SEPA excludes paid invoices.
//
// Usage: node scripts/smoke-e2e.mjs
// Requires the API running at http://localhost:3001 and the `acme` tenant
// seeded with admin@acme.local / ChangeMe123!.
//
// Note: leaves timestamped fixtures (Ana<STAMP>, Smoke Group <STAMP>, an
// invoice in 2027-01) in the dev DB on each run. Harmless but accumulates;
// truncate the dev DB if it gets noisy.

const BASE = 'http://localhost:3001';
const TENANT = 'acme';
const EMAIL = 'admin@acme.local';
const PASSWORD = 'ChangeMe123!';
const STAMP = Date.now().toString().slice(-6);
const TEST_MONTH = 1;
const TEST_YEAR = 2027;
const TEST_ISSUE_DATE = `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, '0')}-05`;

let token = '';
const summary = [];

function record(step, ok, detail = '') {
  summary.push({ step, ok, detail });
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${step}${detail ? ` — ${detail}` : ''}`);
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const err = new Error(
      `${method} ${path} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`,
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function downloadBinary(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, contentType: res.headers.get('content-type'), disposition: res.headers.get('content-disposition') };
}

function assert(cond, msg) {
  if (!cond) throw new Error('assertion failed: ' + msg);
}

async function run() {
  // ── 1. Login ───────────────────────────────────────────────────────────────
  try {
    const r = await api('POST', '/auth/login', {
      tenantSlug: TENANT,
      email: EMAIL,
      password: PASSWORD,
    });
    assert(r.accessToken, 'no accessToken in response');
    token = r.accessToken;
    record('1. Login', true, `user=${r.user?.email}`);
  } catch (e) {
    record('1. Login', false, e.message);
    return;
  }

  // ── 2. Settings: configure fiscal + SEPA creditor ──────────────────────────
  try {
    const r = await api('PATCH', '/settings', {
      name: 'Academia Acme',
      legalName: 'Acme Formación SL',
      taxId: 'B12345678',
      address: 'Calle Mayor 1, 28013 Madrid',
      contactEmail: 'hola@acme.local',
      contactPhone: '+34 600 000 000',
      iban: 'ES9121000418450200051332',
      sepaCreditorId: 'ES12ZZZB12345678',
      invoicePrefix: 'F',
    });
    assert(r.legalName === 'Acme Formación SL', 'legalName not persisted');
    assert(r.iban === 'ES9121000418450200051332', 'iban not persisted');
    assert(r.sepaCreditorId === 'ES12ZZZB12345678', 'sepaCreditorId not persisted');
    record('2. Settings (fiscal + SEPA)', true, `legalName="${r.legalName}"`);
  } catch (e) {
    record('2. Settings', false, e.message);
    return;
  }

  // ── 3. Student with IBAN + mandate ─────────────────────────────────────────
  let studentId, studentNoIbanId;
  try {
    const s1 = await api('POST', '/students', {
      firstName: `Ana${STAMP}`,
      lastName: 'GarcíaSmoke',
      email: `ana${STAMP}@example.com`,
      iban: 'ES7921000813610123456789',
      mandateReference: `MND-${STAMP}`,
      mandateDate: '2026-01-15T00:00:00.000Z',
    });
    studentId = s1.id;
    assert(s1.iban === 'ES7921000813610123456789', `iban roundtrip: got ${s1.iban}`);
    assert(s1.mandateReference === `MND-${STAMP}`, 'mandateReference roundtrip');
    record('3a. Student with mandate', true, `id=${studentId.slice(0, 8)}…`);

    const s2 = await api('POST', '/students', {
      firstName: `Sin${STAMP}`,
      lastName: 'MandatoSmoke',
    });
    studentNoIbanId = s2.id;
    record('3b. Student without mandate', true, `id=${studentNoIbanId.slice(0, 8)}…`);
  } catch (e) {
    record('3. Students', false, e.message);
    return;
  }

  // ── 4. Course (reuse existing or create) ───────────────────────────────────
  let courseId;
  try {
    const courses = await api('GET', '/courses');
    if (courses.length > 0) {
      courseId = courses[0].id;
      record('4. Course (reused)', true, `name="${courses[0].name}"`);
    } else {
      const c = await api('POST', '/courses', {
        name: `Smoke Course ${STAMP}`,
        description: 'auto',
      });
      courseId = c.id;
      record('4. Course (created)', true, `name="${c.name}"`);
    }
  } catch (e) {
    record('4. Course', false, e.message);
    return;
  }

  // ── 5. Group with monthly fee ──────────────────────────────────────────────
  let groupId;
  try {
    const g = await api('POST', '/groups', {
      courseId,
      name: `Smoke Group ${STAMP}`,
      maxCapacity: 10,
      monthlyFee: 50,
    });
    groupId = g.id;
    assert(g.monthlyFee !== null && Number(g.monthlyFee) === 50, `monthlyFee got ${g.monthlyFee}`);
    record('5. Group with cuota mensual', true, `name="${g.name}", fee=${g.monthlyFee}`);
  } catch (e) {
    record('5. Group', false, e.message);
    return;
  }

  // ── 6. Enroll student ──────────────────────────────────────────────────────
  let enrollmentId;
  try {
    const e = await api('POST', '/enrollments', { studentId, groupId });
    enrollmentId = e.id;
    record('6. Enrollment', true, `id=${enrollmentId.slice(0, 8)}…`);
  } catch (e) {
    record('6. Enrollment', false, e.message);
    return;
  }

  // ── 7. Override + clear enrollment fee ─────────────────────────────────────
  try {
    const e1 = await api('PATCH', `/enrollments/${enrollmentId}`, { monthlyFeeOverride: 40 });
    assert(Number(e1.monthlyFeeOverride) === 40, `override set: got ${e1.monthlyFeeOverride}`);
    const e2 = await api('PATCH', `/enrollments/${enrollmentId}`, { monthlyFeeOverride: null });
    assert(e2.monthlyFeeOverride === null, `override cleared: got ${e2.monthlyFeeOverride}`);
    record('7. Override fee set+clear', true, '');
  } catch (e) {
    record('7. Override fee', false, e.message);
    return;
  }

  // ── 8. Generate monthly invoices (dry run + real + idempotent) ─────────────
  let invoiceId, invoiceNumber;
  try {
    const dry = await api('POST', '/billing/generate-month', {
      month: TEST_MONTH,
      year: TEST_YEAR,
      dryRun: true,
    });
    const myDry = dry.results.find((r) => r.enrollmentId === enrollmentId);
    assert(myDry, 'student not in dryRun preview');
    assert(myDry.status === 'WOULD_CREATE', `dryRun status got ${myDry?.status}`);
    assert(Number(myDry.amount) === 50, `dryRun amount got ${myDry?.amount}`);

    const real = await api('POST', '/billing/generate-month', {
      month: TEST_MONTH,
      year: TEST_YEAR,
    });
    const myReal = real.results.find((r) => r.enrollmentId === enrollmentId);
    assert(myReal?.status === 'CREATED', `real status got ${myReal?.status}`);
    invoiceId = myReal.invoiceId;
    assert(invoiceId, 'no invoiceId in CREATED result');

    const again = await api('POST', '/billing/generate-month', {
      month: TEST_MONTH,
      year: TEST_YEAR,
    });
    const mySecond = again.results.find((r) => r.enrollmentId === enrollmentId);
    assert(mySecond?.status === 'SKIPPED', `idempotency got ${mySecond?.status}`);

    const inv = await api('GET', `/invoices/${invoiceId}`);
    invoiceNumber = inv.number;
    assert(/^F-\d{4}-\d{4}$/.test(invoiceNumber), `number format: ${invoiceNumber}`);
    record('8. Generate mensualidades (dry/real/idempotent)', true, `invoice=${invoiceNumber}`);
  } catch (e) {
    record('8. Generate mensualidades', false, e.message);
    return;
  }

  // ── 9. Partial payment ─────────────────────────────────────────────────────
  try {
    await api('POST', `/invoices/${invoiceId}/payments`, { amount: 30, method: 'CASH' });
    const inv = await api('GET', `/invoices/${invoiceId}`);
    assert(inv.status === 'PARTIAL', `status after partial: ${inv.status}`);
    assert(Number(inv.paidAmount) === 30, `paidAmount: ${inv.paidAmount}`);
    record('9. Partial payment → PARTIAL', true, `paid=${inv.paidAmount}`);
  } catch (e) {
    record('9. Partial payment', false, e.message);
    return;
  }

  // ── 10. PDF download ───────────────────────────────────────────────────────
  try {
    const { buf, contentType, disposition } = await downloadBinary(
      'GET',
      `/invoices/${invoiceId}/pdf`,
    );
    assert(contentType?.includes('application/pdf'), `content-type: ${contentType}`);
    assert(disposition?.includes(`factura-${invoiceNumber}.pdf`), `disposition: ${disposition}`);
    assert(buf.slice(0, 4).toString() === '%PDF', `magic bytes: ${buf.slice(0, 4).toString()}`);
    assert(buf.length > 1000, `pdf size suspiciously small: ${buf.length}`);
    record('10. PDF download', true, `size=${buf.length}B`);
  } catch (e) {
    record('10. PDF download', false, e.message);
    return;
  }

  // ── 11. Manual invoice for the no-mandate student (to test SEPA skip) ──────
  try {
    await api('POST', '/invoices', {
      studentId: studentNoIbanId,
      amount: 10,
      description: 'Smoke no-mandate',
      issueDate: `${TEST_ISSUE_DATE}T12:00:00.000Z`,
    });
    record('11. Manual invoice for no-mandate student', true, '');
  } catch (e) {
    record('11. Manual invoice', false, e.message);
    return;
  }

  // ── 12. SEPA preview ───────────────────────────────────────────────────────
  try {
    const r = await api('POST', '/billing/sepa-remittance/preview', {
      month: TEST_MONTH,
      year: TEST_YEAR,
    });
    const myIncl = r.included.find((i) => i.invoiceId === invoiceId);
    assert(myIncl, 'my invoice not included in SEPA preview');
    assert(myIncl.amount === '20.00', `expected 20.00 pending, got ${myIncl.amount}`);
    const noMandate = r.skipped.find((s) => s.studentName.includes('Sin' + STAMP));
    assert(noMandate, 'no-mandate student not in skipped');
    assert(/mandato/i.test(noMandate.reason), `skip reason: ${noMandate.reason}`);
    record('12. SEPA preview (incluida + omitida)', true,
      `included.amount=${myIncl.amount}, skipped.reason="${noMandate.reason}"`);
  } catch (e) {
    record('12. SEPA preview', false, e.message);
    return;
  }

  // ── 13. SEPA XML download ──────────────────────────────────────────────────
  try {
    const { buf, contentType, disposition } = await downloadBinary(
      'POST',
      '/billing/sepa-remittance',
      { month: TEST_MONTH, year: TEST_YEAR, collectionDate: `${TEST_YEAR}-${String(TEST_MONTH).padStart(2, '0')}-28T12:00:00.000Z` },
    );
    assert(contentType?.includes('application/xml'), `content-type: ${contentType}`);
    assert(disposition?.includes(`remesa-sepa-${TEST_YEAR}-${String(TEST_MONTH).padStart(2, '0')}.xml`), `disposition: ${disposition}`);
    const xml = buf.toString();
    assert(xml.includes('pain.008.001.02'), 'XML missing pain.008.001.02 schema');
    assert(xml.includes('ES9121000418450200051332'), 'XML missing creditor IBAN');
    assert(xml.includes('ES7921000813610123456789'), 'XML missing debtor IBAN');
    assert(xml.includes(`<MndtId>MND-${STAMP}</MndtId>`), 'XML missing mandate id');
    assert(xml.includes(`<EndToEndId>${invoiceNumber}</EndToEndId>`), 'XML missing invoice EndToEndId');
    assert(/<ReqdColltnDt>\d{4}-\d{2}-28<\/ReqdColltnDt>/.test(xml), 'collection date wrong');
    // CtrlSum should include 20.00 from my invoice (might be more if other pending invoices exist in the same month)
    const ctrlSum = xml.match(/<CtrlSum>([\d.]+)<\/CtrlSum>/)?.[1];
    assert(ctrlSum && Number(ctrlSum) >= 20, `CtrlSum: ${ctrlSum}`);
    record('13. SEPA XML download', true, `size=${buf.length}B, ctrlSum=${ctrlSum}`);
  } catch (e) {
    record('13. SEPA XML', false, e.message);
    return;
  }

  // ── 14. Finish payment → PAID ──────────────────────────────────────────────
  try {
    await api('POST', `/invoices/${invoiceId}/payments`, { amount: 20, method: 'TRANSFER' });
    const inv = await api('GET', `/invoices/${invoiceId}`);
    assert(inv.status === 'PAID', `expected PAID, got ${inv.status}`);
    assert(Number(inv.paidAmount) === 50, `paidAmount should be 50, got ${inv.paidAmount}`);
    record('14. Finish payment → PAID', true, '');
  } catch (e) {
    record('14. Finish payment', false, e.message);
    return;
  }

  // ── 15. SEPA preview again — should exclude PAID ───────────────────────────
  try {
    const r = await api('POST', '/billing/sepa-remittance/preview', {
      month: TEST_MONTH,
      year: TEST_YEAR,
    });
    const stillThere = r.included.find((i) => i.invoiceId === invoiceId);
    assert(!stillThere, 'PAID invoice still appears in SEPA included!');
    record('15. SEPA excludes PAID invoice', true, '');
  } catch (e) {
    record('15. SEPA excludes PAID', false, e.message);
    return;
  }
}

await run().catch((e) => {
  console.error('FATAL:', e);
  process.exit(2);
});

const failed = summary.filter((s) => !s.ok);
console.log('\n────────────────────────────');
console.log(`Results: ${summary.length - failed.length}/${summary.length} pasos verde.`);
if (failed.length > 0) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  ❌ ${f.step}: ${f.detail}`);
  process.exit(1);
}
console.log('🎉 todo verde.');
