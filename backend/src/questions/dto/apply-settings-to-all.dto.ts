import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';

export enum ApplySettingsGroup {
  JOINING = 'joining',
  SHOW_RESPONSES = 'showResponses',
}

export class ApplySettingsToAllDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ApplySettingsGroup, { each: true })
  groups: ApplySettingsGroup[];
}
