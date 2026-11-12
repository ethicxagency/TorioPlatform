import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice/invoice.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({ controllers: [OrdersController], providers: [OrdersService, InvoiceService] })
export class OrdersModule {}
