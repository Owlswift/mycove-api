import { IsIn } from 'class-validator';

export class UpdateComplaintStatusDto {
  @IsIn(['SUBMITTED', 'IN_REVIEW', 'RESOLVED'])
  status!: string;
}