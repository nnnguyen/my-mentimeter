import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateResponseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text: string;

  @IsString()
  @IsUUID()
  participantSessionId: string;
}
