import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicService } from './public.service';
import { PublicEnrollDto } from './dto/public-enroll.dto';
import { PublicTrialDto } from './dto/public-trial.dto';

// Public, unauthenticated endpoints for an academy's self-service enrollment
// page. Rate limited; submissions land as PENDING for admin review.
@Controller('public/academy/:slug')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('groups')
  groups(@Param('slug') slug: string) {
    return this.publicService.enrollableGroups(slug);
  }

  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @Post('enroll')
  enroll(@Param('slug') slug: string, @Body() dto: PublicEnrollDto) {
    return this.publicService.enroll(slug, dto);
  }

  /** Classes of a group open for a free trial (if the academy offers them). */
  @Get('groups/:groupId/trial-sessions')
  trialSessions(@Param('slug') slug: string, @Param('groupId') groupId: string) {
    return this.publicService.trialSessions(slug, groupId);
  }

  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @Post('trial')
  bookTrial(@Param('slug') slug: string, @Body() dto: PublicTrialDto) {
    return this.publicService.bookTrial(slug, dto);
  }
}
