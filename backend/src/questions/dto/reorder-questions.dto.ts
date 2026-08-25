import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderQuestionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  orderedIds: string[];
}
