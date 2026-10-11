import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Public } from '../../auth/decorators/public.decorator';
import { Role } from '@shedflow/db';
import { OrgGuard } from '../../common/tenancy/org.guard';
import { Roles } from '../../common/tenancy/roles.decorator';
import { RolesGuard } from '../../common/tenancy/roles.guard';
import {
  CurrentPortalCustomer,
  CustomerPortalGuard,
  type PortalCustomerContext,
} from '../portal-context';
import { ReviewsService } from './reviews.service';

class SubmitReviewDto {
  @IsUUID()
  bookingId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}

class UpdateReviewDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;
}

@Controller('customer/reviews')
@UseGuards(CustomerPortalGuard)
export class ReviewsCustomerController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  submit(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.reviews.submit(ctx, dto);
  }

  @Patch(':id')
  update(
    @CurrentPortalCustomer() ctx: PortalCustomerContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.reviews.update(ctx, id, dto);
  }
}

@Controller('organizations/:orgId/reviews')
@UseGuards(OrgGuard, RolesGuard)
@Roles(Role.OWNER, Role.ADMIN)
export class ReviewsStaffController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post(':id/hide')
  hide(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reviews.hideStaff(orgId, id);
  }
}

@Controller('public/organizations/:orgId/reviews')
export class ReviewsPublicController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('summary')
  summary(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.reviews.publicAggregate(orgId, process.env.FLAGS);
  }
}
