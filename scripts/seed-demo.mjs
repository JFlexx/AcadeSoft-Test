#!/usr/bin/env node
// Populates the `acme` tenant with realistic demo data so the app looks alive
// for a demo (teachers, courses, groups, students with SEPA + sibling
// discounts, enrollments, past/future sessions, attendance, generated monthly
// invoices and some payments).
//
// Usage:
//   1) API running at http://localhost:3001
//   2) `acme` tenant seeded (admin@acme.local / ChangeMe123!)
//   3) node scripts/seed-demo.mjs
//
// Safe to reason about: if demo data already exists (a course named "Inglés"),
// it stops without duplicating anything.

const BASE = 'http://localhost:3001';
const TENANT = 'acme';
const EMAIL = 'admin@acme.local';
const PASSWORD = 'ChangeMe123!';

let token = '';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
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
    throw new Error(
      `${method} ${path} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`,
    );
  }
  return json;
}

function at(daysFromNow, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function main() {
  // 1. Login
  const login = await api('POST', '/auth/login', {
    tenantSlug: TENANT,
    email: EMAIL,
    password: PASSWORD,
  });
  token = login.accessToken;
  console.log('✓ Login OK');

  // Guard against double-seeding
  const existingCourses = await api('GET', '/courses');
  if (existingCourses.some((c) => c.name === 'Inglés')) {
    console.log(
      '⚠ Ya hay datos de demo (curso "Inglés"). No se crea nada para evitar duplicados.',
    );
    return;
  }

  // 2. Settings (fiscal + SEPA so PDFs and remittances work)
  await api('PATCH', '/settings', {
    name: 'Academia Demo',
    legalName: 'Academia Demo SL',
    taxId: 'B12345678',
    address: 'Calle Mayor 1, 28013 Madrid',
    contactEmail: 'hola@academiademo.es',
    contactPhone: '+34 600 123 456',
    iban: 'ES9121000418450200051332',
    sepaCreditorId: 'ES12ZZZB12345678',
    invoicePrefix: 'F',
  });
  console.log('✓ Ajustes (fiscal + SEPA)');

  // 3. Teachers
  const teachers = {};
  for (const t of [
    { firstName: 'Laura', lastName: 'Martín', email: 'laura@academiademo.es', bio: 'Filóloga inglesa, 10 años de experiencia.' },
    { firstName: 'Carlos', lastName: 'Ruiz', email: 'carlos@academiademo.es', bio: 'Licenciado en Matemáticas.' },
    { firstName: 'Marta', lastName: 'Sanz', email: 'marta@academiademo.es', bio: 'Profesora de piano y solfeo.' },
  ]) {
    const r = await api('POST', '/teachers', t);
    teachers[t.firstName] = r.id;
  }
  console.log('✓ Profesores (3)');

  // 4. Courses
  const courses = {};
  for (const c of [
    { name: 'Inglés', description: 'Inglés general por niveles', color: '#2563eb' },
    { name: 'Matemáticas', description: 'Refuerzo y ESO', color: '#16a34a' },
    { name: 'Música', description: 'Instrumento y lenguaje musical', color: '#db2777' },
  ]) {
    const r = await api('POST', '/courses', c);
    courses[c.name] = r.id;
  }
  console.log('✓ Cursos (3)');

  // 5. Groups
  const groups = {};
  for (const g of [
    { key: 'inglesB1', courseId: courses['Inglés'], teacherId: teachers['Laura'], name: 'Inglés B1', maxCapacity: 10, monthlyFee: 55 },
    { key: 'inglesA2', courseId: courses['Inglés'], teacherId: teachers['Laura'], name: 'Inglés A2', maxCapacity: 12, monthlyFee: 50 },
    { key: 'mateESO', courseId: courses['Matemáticas'], teacherId: teachers['Carlos'], name: 'Matemáticas ESO', maxCapacity: 8, monthlyFee: 60 },
    { key: 'piano', courseId: courses['Música'], teacherId: teachers['Marta'], name: 'Piano (individual)', maxCapacity: 1, monthlyFee: 90 },
  ]) {
    const { key, ...payload } = g;
    const r = await api('POST', '/groups', payload);
    groups[key] = r.id;
  }
  console.log('✓ Grupos (4)');

  // 6. Students (a sibling pair with discount; a couple with SEPA mandate)
  const mandate = (ref) => ({
    iban: 'ES7921000813610123456789',
    mandateReference: ref,
    mandateDate: '2026-01-15T00:00:00.000Z',
  });
  const studentDefs = [
    { key: 'lucia', firstName: 'Lucía', lastName: 'Fernández', email: 'lucia@example.com', phone: '600111222', ...mandate('MND-001') },
    { key: 'pablo', firstName: 'Pablo', lastName: 'Fernández', email: 'pablo@example.com', phone: '600111223', discountPercent: 15, ...mandate('MND-002') },
    { key: 'sofia', firstName: 'Sofía', lastName: 'López', email: 'sofia@example.com', ...mandate('MND-003') },
    { key: 'hugo', firstName: 'Hugo', lastName: 'Díaz', email: 'hugo@example.com' },
    { key: 'elena', firstName: 'Elena', lastName: 'Moreno', email: 'elena@example.com', ...mandate('MND-004') },
    { key: 'marco', firstName: 'Marco', lastName: 'Jiménez', email: 'marco@example.com' },
    { key: 'noa', firstName: 'Noa', lastName: 'Vidal', email: 'noa@example.com', discountPercent: 10 },
  ];
  const students = {};
  for (const s of studentDefs) {
    const { key, ...payload } = s;
    const r = await api('POST', '/students', payload);
    students[key] = r.id;
  }
  console.log('✓ Alumnos (7, con SEPA y descuentos de hermanos)');

  // 7. Enrollments
  const enrollPairs = [
    ['lucia', 'inglesB1'],
    ['pablo', 'inglesA2'],
    ['sofia', 'inglesB1'],
    ['hugo', 'mateESO'],
    ['elena', 'mateESO'],
    ['marco', 'inglesA2'],
    ['noa', 'piano'],
    ['sofia', 'mateESO'],
  ];
  for (const [stu, grp] of enrollPairs) {
    await api('POST', '/enrollments', { studentId: students[stu], groupId: groups[grp] });
  }
  console.log('✓ Inscripciones (8)');

  // 8. Sessions: past (for attendance) + upcoming (for the calendar)
  const sessionPlan = [
    { grp: 'inglesB1', days: [-7, -3, 2, 5, 9] },
    { grp: 'inglesA2', days: [-6, -2, 3, 6] },
    { grp: 'mateESO', days: [-4, 1, 4, 8] },
    { grp: 'piano', days: [-1, 6] },
  ];
  const pastSessionsByGroup = {};
  for (const { grp, days } of sessionPlan) {
    pastSessionsByGroup[grp] = [];
    for (const d of days) {
      const s = await api('POST', '/sessions', {
        groupId: groups[grp],
        scheduledAt: at(d, 17, 0),
      });
      if (d < 0) pastSessionsByGroup[grp].push(s.id);
    }
  }
  console.log('✓ Sesiones (pasadas + próximas)');

  // 9. Attendance for the past sessions (mostly present, a few absences)
  for (const grp of Object.keys(pastSessionsByGroup)) {
    const enr = await api('GET', `/enrollments?groupId=${groups[grp]}`);
    const active = enr.filter((e) => e.status === 'ACTIVE');
    if (active.length === 0) continue;
    for (const sessionId of pastSessionsByGroup[grp]) {
      const items = active.map((e, i) => ({
        studentId: e.studentId,
        status: i % 4 === 0 ? 'ABSENT' : 'PRESENT',
      }));
      await api('POST', `/sessions/${sessionId}/attendance`, { items });
    }
  }
  console.log('✓ Asistencia registrada en sesiones pasadas');

  // 10. Generate this month's invoices
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const gen = await api('POST', '/billing/generate-month', { month, year });
  console.log(`✓ Mensualidades generadas: ${gen.summary.created} facturas`);

  // 11. Register some payments (one full, one partial; rest pending)
  const invoices = await api('GET', '/invoices');
  const thisMonth = invoices.filter((i) => i.billingPeriod === `${year}-${String(month).padStart(2, '0')}`);
  if (thisMonth[0]) {
    await api('POST', `/invoices/${thisMonth[0].id}/payments`, {
      amount: Number(thisMonth[0].amount),
      method: 'TRANSFER',
    });
  }
  if (thisMonth[1]) {
    await api('POST', `/invoices/${thisMonth[1].id}/payments`, {
      amount: Math.max(10, Math.round(Number(thisMonth[1].amount) / 2)),
      method: 'CASH',
    });
  }
  console.log('✓ Pagos de ejemplo (1 completo, 1 parcial)');

  console.log('\n🎉 Datos de demo creados. Entra en http://localhost:3000');
  console.log(`   Academia: Academia Demo · Usuario: ${EMAIL} · Clave: ${PASSWORD}`);
}

main().catch((e) => {
  console.error('\n❌ Error sembrando demo:', e.message);
  process.exit(1);
});
