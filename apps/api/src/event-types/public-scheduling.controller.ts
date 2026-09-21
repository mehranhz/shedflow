import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { AvailabilityService } from '../availability/availability.service';
import { OrganizationRepository } from '../organizations/organization.repository';
import { EventTypesService } from './event-types.service';

@Public()
@Controller('public/orgs/:orgSlug')
export class PublicSchedulingController {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly eventTypes: EventTypesService,
    private readonly availability: AvailabilityService,
  ) {}

  @Get()
  async getOrg(@Param('orgSlug') orgSlug: string) {
    const org = await this.requireOrg(orgSlug);
    return {
      name: org.name,
      slug: org.slug,
      logoUrl: org.logoUrl,
      brandColor: org.brandColor,
      locale: org.locale,
      timezone: org.timezone,
      hideSchedflowBadge: Boolean(
        (org.settings?.branding as { hideSchedflowBadge?: boolean } | undefined)
          ?.hideSchedflowBadge,
      ),
    };
  }

  @Get('event-types')
  async listEventTypes(@Param('orgSlug') orgSlug: string) {
    const org = await this.requireOrg(orgSlug);
    const items = await this.eventTypes.listPublic(org.id);
    return items.map((item) => this.eventTypes.toPublic(item));
  }

  @Get('event-types/:eventSlug')
  async getEventType(
    @Param('orgSlug') orgSlug: string,
    @Param('eventSlug') eventSlug: string,
  ) {
    const org = await this.requireOrg(orgSlug);
    const eventType = await this.eventTypes.getPublicBySlug(org.id, eventSlug);
    return {
      ...this.eventTypes.toPublic(eventType),
      organization: {
        name: org.name,
        slug: org.slug,
        logoUrl: org.logoUrl,
        brandColor: org.brandColor,
        locale: org.locale,
        timezone: org.timezone,
      },
    };
  }

  @Get('event-types/:eventSlug/slots')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async listSlots(
    @Param('orgSlug') orgSlug: string,
    @Param('eventSlug') eventSlug: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('tz') tz?: string,
  ) {
    const org = await this.requireOrg(orgSlug);
    return this.availability.listSlots({
      organizationId: org.id,
      eventTypeIdOrSlug: eventSlug,
      rangeStart: from ? new Date(from) : new Date(),
      rangeEnd: to ? new Date(to) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      inviteeTimeZone: tz ?? org.timezone,
    });
  }

  private async requireOrg(orgSlug: string) {
    const org = await this.organizations.findBySlug(orgSlug);
    if (!org || org.deletedAt) {
      throw new NotFoundException('Not found');
    }
    return org;
  }
}
