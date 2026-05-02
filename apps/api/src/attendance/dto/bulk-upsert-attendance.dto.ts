import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { UpsertAttendanceItemDto } from './upsert-attendance-item.dto';

export class BulkUpsertAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertAttendanceItemDto)
  items!: UpsertAttendanceItemDto[];
}
