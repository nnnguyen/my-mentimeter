import { IsString, IsUUID } from 'class-validator';

export class SetCurrentQuestionDto {
  @IsString()
  @IsUUID()
  questionId: string;
}
