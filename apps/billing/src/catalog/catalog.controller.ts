import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CatalogService, ProductResponse } from './catalog.service';
import {
  CreatePriceDto,
  CreateProductDto,
  UpdateProductDto,
} from './dto/catalog.dto';
import { CatalogPrice } from './price.repository';
import { CatalogProduct } from './product.repository';

@Controller('billing/organizations/:orgId/products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProductResponse[]> {
    return this.catalog.listProducts(orgId, user);
  }

  @Post()
  create(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateProductDto,
  ): Promise<CatalogProduct> {
    return this.catalog.createProduct(orgId, user, body);
  }

  @Patch(':productId')
  update(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UpdateProductDto,
  ): Promise<CatalogProduct> {
    return this.catalog.updateProduct(orgId, productId, user, body);
  }

  @Post(':productId/prices')
  createPrice(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePriceDto,
  ): Promise<CatalogPrice> {
    return this.catalog.createPrice(orgId, productId, user, body);
  }
}
