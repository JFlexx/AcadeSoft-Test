import PDFDocument from 'pdfkit';

export type ReportCardData = {
  academy: {
    name: string;
    address: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
  };
  title: string;
  period: { from: string; to: string };
  student: { firstName: string; lastName: string };
  groups: {
    name: string;
    course: string;
    teacher: string | null;
    assessments: { date: string; name: string; score: string | null; comment: string | null }[];
    average: string | null;
    attendance: { attended: number; marked: number; pct: number | null };
  }[];
};

const dmy = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
const num = (s: string) => Number(s).toLocaleString('es-ES', { maximumFractionDigits: 2 });

/** Report card (boletín de notas) of one student for one term. */
export function buildReportCardPdf(d: ReportCardData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(18).text(d.academy.name, 50, 50);
    doc.font('Helvetica').fontSize(9).fillColor('#6b7280');
    const contact = [d.academy.address, d.academy.contactEmail, d.academy.contactPhone]
      .filter(Boolean)
      .join(' · ');
    if (contact) doc.text(contact, 50, 74, { width: 495 });

    doc.moveDown(2);
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(15).text('Boletín de notas');
    doc.font('Helvetica').fontSize(11).text(d.title);
    doc
      .fillColor('#6b7280')
      .fontSize(9)
      .text(`Del ${dmy(d.period.from)} al ${dmy(d.period.to)}`);
    doc.moveDown(0.8);
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(`${d.student.firstName} ${d.student.lastName}`);
    doc.moveDown(0.6);

    if (d.groups.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Sin notas en este periodo.');
    }

    for (const g of d.groups) {
      if (doc.y > 680) doc.addPage();
      doc.moveDown(0.6);
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text(`${g.name} · ${g.course}`);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#6b7280')
        .text(
          [
            g.teacher ? `Profesor/a: ${g.teacher}` : null,
            g.attendance.pct != null
              ? `Asistencia: ${g.attendance.pct}% (${g.attendance.attended} de ${g.attendance.marked} clases)`
              : 'Asistencia: sin registros',
          ]
            .filter(Boolean)
            .join('   ·   '),
        );
      doc.moveDown(0.4);

      if (g.assessments.length === 0) {
        doc.fontSize(10).fillColor('#6b7280').text('Sin evaluaciones en este periodo.');
        continue;
      }
      // Table header
      const top = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
      doc.text('Fecha', 50, top, { width: 70 });
      doc.text('Evaluación', 120, top, { width: 160 });
      doc.text('Nota', 280, top, { width: 40, align: 'right' });
      doc.text('Comentario', 335, top, { width: 210 });
      doc
        .moveTo(50, top + 13)
        .lineTo(545, top + 13)
        .strokeColor('#e5e7eb')
        .stroke();
      let y = top + 18;
      doc.font('Helvetica').fontSize(9).fillColor('#111827');
      for (const a of g.assessments) {
        const h = Math.max(
          doc.heightOfString(a.name, { width: 160 }),
          a.comment ? doc.heightOfString(a.comment, { width: 210 }) : 0,
          11,
        );
        if (y + h > 770) {
          doc.addPage();
          y = 50;
        }
        doc.text(dmy(a.date), 50, y, { width: 70 });
        doc.text(a.name, 120, y, { width: 160 });
        doc.font('Helvetica-Bold').text(a.score != null ? num(a.score) : '—', 280, y, {
          width: 40,
          align: 'right',
        });
        doc
          .font('Helvetica')
          .fillColor('#374151')
          .text(a.comment ?? '', 335, y, { width: 210 });
        doc.fillColor('#111827');
        y += h + 6;
      }
      doc.y = y;
      if (g.average != null) {
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(`Media: ${num(g.average)}`, 50, y + 2, { width: 270, align: 'right' });
      }
      doc.x = 50;
      doc.moveDown(0.5);
    }

    // Footer below the content area: without lifting the bottom margin,
    // pdfkit would push it onto a new, blank page.
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#9ca3af')
      .text(`Generado el ${new Date().toLocaleDateString('es-ES')}`, 50, 790, {
        width: 495,
        align: 'right',
      });
    doc.end();
  });
}
