import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  prompt?: string;
}
