import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateTopicDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxWordsPerUser?: number;
}
