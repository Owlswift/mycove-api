import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  phone!: string;

  @IsString()
  fullName!: string;

  @IsIn(['RESIDENT', 'GUARD'])
  role!: 'RESIDENT' | 'GUARD';

  @IsOptional()
  @IsString()
  house?: string;
}
