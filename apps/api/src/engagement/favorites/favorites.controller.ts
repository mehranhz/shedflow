import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FavoriteKind } from '@shedflow/db';
import { IsEnum, IsUUID } from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import {
  CurrentPortalCustomer,
  CustomerPortalGuard,
  type PortalCustomerContext,
} from '../portal-context';
import { FavoritesService } from './favorites.service';

class AddFavoriteDto {
  @IsEnum(FavoriteKind)
  kind!: FavoriteKind;

  @IsUUID()
  refId!: string;
}

@Controller('customer/favorites')
@UseGuards(CustomerPortalGuard)
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  list(@CurrentPortalCustomer() ctx: PortalCustomerContext) {
    return this.favorites.list(ctx);
  }

  @Post()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  add(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Body() dto: AddFavoriteDto,
  ) {
    return this.favorites.add(ctx, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.favorites.remove(ctx, id);
  }
}
