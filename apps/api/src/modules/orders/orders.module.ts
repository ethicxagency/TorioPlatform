import { Module } from '@nestjs/common';
import { ImagesModule } from '../images/images.module';
import { InvoiceService } from './invoice/invoice.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [ImagesModule],
  controllers: [OrdersController],
  providers: [OrdersService, InvoiceService],
})
export class OrdersModule {}
