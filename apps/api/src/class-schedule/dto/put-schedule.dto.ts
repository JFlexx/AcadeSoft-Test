import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ScheduleSlotDto {
  /** ISO weekday: 1 = lunes … 7 = domingo. */
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime debe ser HH:MM' })
  startTime!: string;

  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes!: number;
}

/** Replaces the whole weekly schedule of a group (an empty list clears it). */
export class PutScheduleDto {
  @IsArray()
  @ArrayMaxSize(14)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  slots!: ScheduleSlotDto[];
}
