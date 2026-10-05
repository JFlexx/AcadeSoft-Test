import { Module } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { RemindersTasks } from './reminders.tasks';

@Module({
  providers: [RemindersService, RemindersTasks],
  exports: [RemindersService],
})
export class RemindersModule {}
