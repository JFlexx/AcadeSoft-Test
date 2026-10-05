import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * Thin wrapper over Resend. Without RESEND_API_KEY it is a no-op (logs and
 * returns false), so the app keeps working until email is configured.
 * Recipient addresses are never written to the logs.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const key = config.get<string>('RESEND_API_KEY');
    this.client = key ? new Resend(key) : null;
    this.from =
      config.get<string>('EMAIL_FROM') ?? 'AcadeSoft <onboarding@resend.dev>';
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** True only if the provider accepted the email. */
  async send(to: string[], subject: string, html: string): Promise<boolean> {
    if (!this.client) {
      this.logger.warn(`Email desactivado (sin RESEND_API_KEY): "${subject}"`);
      return false;
    }
    try {
      const { error } = await this.client.emails.send({
        from: this.from,
        to,
        subject,
        html,
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
