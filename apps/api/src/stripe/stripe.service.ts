import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { computeStatus } from '../invoices/invoices.service';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly webOrigin: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.stripe = new Stripe(config.get<string>('STRIPE_SECRET_KEY') ?? '');
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';
    this.webOrigin =
      config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
  }

  private ensureConfigured() {
    if (!this.config.get<string>('STRIPE_SECRET_KEY')) {
      throw new BadRequestException(
        'Los pagos con tarjeta no están configurados. Añade tu clave de Stripe.',
      );
    }
  }

  /**
   * Creates a Stripe Checkout Session to pay an invoice's pending amount and
   * returns the hosted payment URL. Caller must have already verified the
   * invoice belongs to `tenantId` (and, for the portal, to the guardian).
   */
  async createInvoiceCheckout(tenantId: string, invoiceId: string) {
    this.ensureConfigured();

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: { student: { select: { firstName: true, lastName: true } } },
    });
    if (!invoice) throw new NotFoundException();
    if (invoice.status === 'CANCELLED' || invoice.status === 'PAID') {
      throw new BadRequestException('Esta factura no admite pagos');
    }

    const pending = invoice.amount.sub(invoice.paidAmount);
    if (pending.lte(0)) throw new BadRequestException('No hay importe pendiente');

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: pending.mul(100).toDecimalPlaces(0).toNumber(),
            product_data: {
              name: `Factura ${invoice.number}`,
              description:
                invoice.description ??
                `${invoice.student.firstName} ${invoice.student.lastName}`,
            },
          },
        },
      ],
      success_url: `${this.webOrigin}/pay/success?invoice=${invoiceId}`,
      cancel_url: `${this.webOrigin}/pay/cancelled?invoice=${invoiceId}`,
      metadata: { tenantId, invoiceId },
    });

    return { url: session.url };
  }

  /** Verifies the Stripe signature and applies the paid invoice. */
  async handleWebhook(rawBody: Buffer, signature: string) {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new BadRequestException('Firma de webhook inválida');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.metadata?.tenantId;
      const invoiceId = session.metadata?.invoiceId;
      const reference =
        (typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id) ?? session.id;
      if (tenantId && invoiceId && session.amount_total != null) {
        await this.recordCardPayment(
          tenantId,
          invoiceId,
          session.amount_total,
          reference,
        );
      }
    }

    return { received: true };
  }

  /** Idempotently records a card payment from a completed checkout. */
  private async recordCardPayment(
    tenantId: string,
    invoiceId: string,
    amountCents: number,
    reference: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
    });
    if (!invoice || invoice.status === 'CANCELLED') return;

    const already = await this.prisma.payment.findFirst({
      where: { invoiceId, reference },
    });
    if (already) return;

    const pending = invoice.amount.sub(invoice.paidAmount);
    if (pending.lte(0)) return;

    const paid = new Prisma.Decimal(amountCents).div(100);
    const applied = paid.gt(pending) ? pending : paid;
    const newPaid = invoice.paidAmount.add(applied);

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          tenantId,
          invoiceId,
          amount: applied,
          method: 'CARD',
          reference,
          notes: 'Pago con tarjeta (Stripe)',
        },
      });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { paidAmount: newPaid, status: computeStatus(invoice.amount, newPaid) },
      });
    });
  }
}
