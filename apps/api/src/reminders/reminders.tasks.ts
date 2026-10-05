import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RemindersService } from './reminders.service';

@Injectable()
export class RemindersTasks {
  private readonly logger = new Logger(RemindersTasks.name);

  constructor(private readonly reminders: RemindersService) {}

  // 9am: after the 6am overdue sweep has flagged today's late invoices.
  @Cron('0 9 * * *')
  async sendOverdueReminders(): Promise<void> {
    const res = await this.reminders.sendOverdueReminders();
    if (res.candidates > 0) {
      this.logger.log(
        `Recordatorios de impago: ${res.sent} enviado(s), ${res.skipped} omitido(s)`,
      );
    }
  }
}
