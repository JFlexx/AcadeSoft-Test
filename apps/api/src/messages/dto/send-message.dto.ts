import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { MessageTargetDto } from './message-target.dto';

export class SendMessageDto extends MessageTargetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  @Matches(/^[^\r\n]*$/, { message: 'El asunto no puede contener saltos de línea' })
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;
}
