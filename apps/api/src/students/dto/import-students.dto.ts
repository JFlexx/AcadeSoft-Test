import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateStudentDto } from './create-student.dto';

/**
 * Bulk import of students (e.g. from a CSV exported from another system).
 * Each row is validated with the same rules as a single create.
 */
export class ImportStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => CreateStudentDto)
  students!: CreateStudentDto[];
}
