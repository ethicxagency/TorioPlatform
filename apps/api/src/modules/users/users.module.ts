import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [ImagesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
