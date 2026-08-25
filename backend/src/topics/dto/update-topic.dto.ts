import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TopicStatus } from '@prisma/client';

export class UpdateTopicDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxWordsPerUser?: number;

  @IsOptional()
  @IsEnum(TopicStatus)
  status?: TopicStatus;
}
