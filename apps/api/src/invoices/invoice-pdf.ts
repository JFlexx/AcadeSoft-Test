import PDFDocument from 'pdfkit';
import { InvoiceStatus, PaymentMethod, Prisma } from '@prisma/client';

type Payment = {
  amount: Prisma.Decimal;
  method: PaymentMethod;
  paidAt: Date;
  reference: string | null;
};

type InvoiceForPdf = {
  number: string;
  description: string | null;
  notes: string | null;
  amount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  issueDate: Date;
  dueDate: Date | null;
  status: InvoiceStatus;
  billingPeriod: string | null;
  student: {
    firstName: string;
    lastName: string;
    email: string | null;
    address: string | null;
  };
  payments: Payment[];
};

const STATUS_LABEL_ES: Record<InvoiceStatus, string> = {
  DRAFT: 'BORRADOR',
  PENDING: 'PENDIENTE',
  PARTIAL: 'PARCIAL',
  PAID: 'COBRADA',
  OVERDUE: 'VENCIDA',
  CANCELLED: 'ANULADA',
};

const STATUS_COLOR: Record<InvoiceStatus, string> = {
  DRAFT: '#6b7280',
  PENDING: '#b45309',
  PARTIAL: '#1d4ed8',
  PAID: '#15803d',
  OVERDUE: '#b91c1c',
  CANCELLED: '#6b7280',
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  OTHER: 'Otro',
};

function eur(value: Prisma.Decimal | number | string): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(value));
}

function fmtDate(d: Date | null): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function buildInvoicePdf(
  invoice: InvoiceForPdf,
  tenantName: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ─── Header
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(tenantName, 50, 50);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text('Factura emitida desde AcadeSoft', 50, 75);

    const rightX = 350;
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('FACTURA', rightX, 50, { width: 195, align: 'right' });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#111827')
      .text(invoice.number, rightX, 72, { width: 195, align: 'right' });
    doc
      .fillColor('#6b7280')
      .fontSize(9)
      .text(`Fecha: ${fmtDate(invoice.issueDate)}`, rightX, 88, {
        width: 195,
        align: 'right',
      });
    if (invoice.dueDate) {
      doc.text(`Vencimiento: ${fmtDate(invoice.dueDate)}`, rightX, 100, {
        width: 195,
        align: 'right',
      });
    }

    // Divider
    doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#e5e7eb').stroke();

    // ─── Status stamp
    doc
      .fillColor(STATUS_COLOR[invoice.status])
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(STATUS_LABEL_ES[invoice.status], 50, 140);

    // ─── Bill to
    doc
      .fillColor('#6b7280')
      .font('Helvetica')
      .fontSize(9)
      .text('FACTURAR A', 50, 165);
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(`${invoice.student.firstName} ${invoice.student.lastName}`, 50, 178);
    let billY = 192;
    if (invoice.student.email) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#6b7280')
        .text(invoice.student.email, 50, billY);
      billY += 12;
    }
    if (invoice.student.address) {
      doc.text(invoice.student.address, 50, billY, { width: 250 });
    }

    // ─── Concepto / line item
    const tableTop = 250;
    doc
      .fillColor('#6b7280')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('CONCEPTO', 50, tableTop)
      .text('IMPORTE', rightX, tableTop, { width: 195, align: 'right' });
    doc
      .moveTo(50, tableTop + 14)
      .lineTo(545, tableTop + 14)
      .strokeColor('#e5e7eb')
      .stroke();

    const concept =
      invoice.description ??
      (invoice.billingPeriod
        ? `Cuota mensual — ${invoice.billingPeriod}`
        : 'Servicio');
    doc
      .fillColor('#111827')
      .font('Helvetica')
      .fontSize(11)
      .text(concept, 50, tableTop + 22, { width: 280 })
      .text(eur(invoice.amount), rightX, tableTop + 22, {
        width: 195,
        align: 'right',
      });

    // ─── Totals box
    const totalsY = tableTop + 90;
    doc
      .moveTo(rightX - 10, totalsY)
      .lineTo(545, totalsY)
      .strokeColor('#e5e7eb')
      .stroke();
    doc
      .fillColor('#6b7280')
      .font('Helvetica')
      .fontSize(10)
      .text('Total', rightX, totalsY + 8, { width: 100, align: 'right' });
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(eur(invoice.amount), rightX + 100, totalsY + 7, {
        width: 95,
        align: 'right',
      });

    doc
      .fillColor('#6b7280')
      .font('Helvetica')
      .fontSize(10)
      .text('Cobrado', rightX, totalsY + 28, { width: 100, align: 'right' });
    doc
      .fillColor('#15803d')
      .font('Helvetica')
      .fontSize(11)
      .text(eur(invoice.paidAmount), rightX + 100, totalsY + 28, {
        width: 95,
        align: 'right',
      });

    const pending = Number(invoice.amount) - Number(invoice.paidAmount);
    doc
      .fillColor('#6b7280')
      .font('Helvetica')
      .fontSize(10)
      .text('Pendiente', rightX, totalsY + 48, { width: 100, align: 'right' });
    doc
      .fillColor(pending > 0 ? '#b45309' : '#15803d')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(eur(pending), rightX + 100, totalsY + 48, {
        width: 95,
        align: 'right',
      });

    // ─── Payments section (if any)
    if (invoice.payments.length > 0) {
      let py = totalsY + 90;
      doc
        .fillColor('#6b7280')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('PAGOS REGISTRADOS', 50, py);
      py += 14;
      doc.moveTo(50, py).lineTo(545, py).strokeColor('#e5e7eb').stroke();
      py += 8;

      doc
        .fillColor('#6b7280')
        .font('Helvetica')
        .fontSize(9)
        .text('Fecha', 50, py)
        .text('Método', 130, py)
        .text('Referencia', 230, py)
        .text('Importe', rightX, py, { width: 195, align: 'right' });
      py += 14;

      for (const p of invoice.payments) {
        doc
          .fillColor('#111827')
          .font('Helvetica')
          .fontSize(10)
          .text(fmtDate(p.paidAt), 50, py)
          .text(METHOD_LABEL[p.method], 130, py)
          .text(p.reference ?? '—', 230, py, { width: 110 })
          .text(eur(p.amount), rightX, py, { width: 195, align: 'right' });
        py += 16;
      }
    }

    // ─── Notes
    if (invoice.notes) {
      const notesY = 720;
      doc
        .fillColor('#6b7280')
        .font('Helvetica-Bold')
        .fontSize(9)
        .text('NOTAS', 50, notesY);
      doc
        .fillColor('#374151')
        .font('Helvetica')
        .fontSize(9)
        .text(invoice.notes, 50, notesY + 14, { width: 495 });
    }

    // ─── Footer
    doc
      .fillColor('#9ca3af')
      .font('Helvetica')
      .fontSize(8)
      .text(
        `Documento generado el ${fmtDate(new Date())} · ${invoice.number}`,
        50,
        790,
        { width: 495, align: 'center' },
      );

    doc.end();
  });
}
