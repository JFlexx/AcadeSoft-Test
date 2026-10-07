import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export type SendOptions = {
  /** Display name shown as sender (e.g. the academy's name). */
  fromName?: string | null;
  /** Where replies go (e.g. the academy's contact email). */
  replyTo?: string | null;
  /** Files to attach (e.g. a report card PDF). */
  attachments?: { filename: string; content: Buffer }[];
};

/** Strips characters that could break or inject into the From header. */
function sanitizeDisplayName(name: string): string {
  return name.replace(/["<>\r\n\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * Thin wrapper over Resend. Without RESEND_API_KEY it is a no-op (logs and
 * returns false), so the app keeps working until email is configured.
 * One verified sender address (EMAIL_FROM) is shared by every academy; each
 * email shows the academy's own name and replies go to the academy.
 * Recipient addresses are never written to the logs.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly fromAddress: string;
  private readonly defaultFromName: string;

  constructor(config: ConfigService) {
    const key = config.get<string>('RESEND_API_KEY');
    this.client = key ? new Resend(key) : null;

    const raw =
      config.get<string>('EMAIL_FROM') ?? 'AcadeSoft <onboarding@resend.dev>';
    const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    this.fromAddress = (m ? m[2] : raw).trim();
    this.defaultFromName = sanitizeDisplayName(m?.[1] ?? '') || 'AcadeSoft';
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** True only if the provider accepted the email. */
  async send(
    to: string[],
    subject: string,
    html: string,
    opts: SendOptions = {},
  ): Promise<boolean> {
    if (!this.client) {
      this.logger.warn(`Email desactivado (sin RESEND_API_KEY): "${subject}"`);
      return false;
    }
    const name = sanitizeDisplayName(opts.fromName ?? '') || this.defaultFromName;
    try {
      const { error } = await this.client.emails.send({
        from: `"${name}" <${this.fromAddress}>`,
        to,
        subject,
        html,
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      });
      if (error) {
        this.logger.error(`Fallo enviando "${subject}": ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(
        `Fallo enviando "${subject}": ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}
