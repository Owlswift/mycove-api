import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateWebsiteLeadDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  estateName?: string;

  @IsString()
  @MinLength(1)
  message!: string;
}
