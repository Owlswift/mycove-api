import { IsIn } from 'class-validator';

export class UpdateWebsiteLeadDto {
  @IsIn(['NEW', 'CONTACTED', 'CLOSED'])
  status!: 'NEW' | 'CONTACTED' | 'CLOSED';
}
