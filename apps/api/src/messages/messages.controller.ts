import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MessagesService } from './messages.service';
import { MessageTargetDto } from './dto/message-target.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: MessageTargetDto,
  ) {
    return this.messages.preview(tenantId, dto);
  }

  // Guard against accidental repeated sends.
  @Throttle({ default: { limit: 20, ttl: 60 * 60 * 1000 } })
  @Post()
  send(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(tenantId, userId, dto);
  }

  @Get()
  list(@CurrentUser('tenantId') tenantId: string) {
    return this.messages.list(tenantId);
  }
}
