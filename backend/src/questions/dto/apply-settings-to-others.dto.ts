import { IsArray, IsOptional, IsBoolean } from 'class-validator';

export class ApplySettingsToOthersDto {
  @IsOptional()
  @IsArray()
  targetQuestionIds?: string[];

  @IsOptional()
  @IsBoolean()
  applyToAll?: boolean;
}
