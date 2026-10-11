import { Module } from '@nestjs/common';
import { CustomerDocumentsController } from './customer-documents.controller';
import { CustomerDocumentsService } from './customer-documents.service';

@Module({
  controllers: [CustomerDocumentsController],
  providers: [CustomerDocumentsService],
  exports: [CustomerDocumentsService],
})
export class CustomerDocumentsModule {}
