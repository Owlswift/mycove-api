import { IsIn } from 'class-validator';

export class SetResidentTypeDto {
  @IsIn(['REGULAR', 'COMMERCIAL'])
  residentType!: 'REGULAR' | 'COMMERCIAL';
}
