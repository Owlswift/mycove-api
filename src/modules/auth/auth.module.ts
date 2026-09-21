import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WhatsappClientModule } from '../whatsapp/whatsapp-client.module';

@Module({
  imports: [WhatsappClientModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
