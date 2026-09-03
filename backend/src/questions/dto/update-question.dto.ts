import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JoiningInfoType, QuestionStatus, QuestionType, ResultVisibility } from '@prisma/client';

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  prompt?: string;

  @IsOptional()
  @IsEnum(QuestionStatus)
  status?: QuestionStatus;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  // --- Response settings ---
  // null = không giới hạn số lượt; @IsOptional() bỏ qua validate khi null/undefined.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  responseLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxWordLength?: number;

  @IsOptional()
  @IsBoolean()
  allowDuplicateFromSameUser?: boolean;

  // --- Design ---
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  questionColor?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  textColorScheme?: string;

  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxWordsDisplayed?: number;

  // --- Joining instructions ---
  @IsOptional()
  @IsBoolean()
  showJoiningInfo?: boolean;

  @IsOptional()
  @IsEnum(JoiningInfoType)
  joiningInfoType?: JoiningInfoType;

  // --- Show responses ---
  @IsOptional()
  @IsEnum(ResultVisibility)
  resultVisibility?: ResultVisibility;

  @IsOptional()
  @IsBoolean()
  showResultsToAudience?: boolean;
}
