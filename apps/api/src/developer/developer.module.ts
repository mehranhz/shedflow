import { Module, forwardRef } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeyOrJwtAuthGuard } from './api-key-or-jwt.guard';
import { ApiKeyRepository } from './api-key.repository';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ScopesGuard } from './scopes.guard';
import { WebhookEndpointRepository } from './webhook-endpoint.repository';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [
    PrismaModule,
    MembershipsModule,
    forwardRef(() => OrganizationsModule),
  ],
  controllers: [ApiKeysController, WebhooksController],
  providers: [
    ApiKeyRepository,
    WebhookEndpointRepository,
    ApiKeysService,
    WebhooksService,
    ApiKeyOrJwtAuthGuard,
    ScopesGuard,
  ],
  exports: [
    ApiKeyRepository,
    WebhookEndpointRepository,
    ApiKeysService,
    WebhooksService,
    ApiKeyOrJwtAuthGuard,
    ScopesGuard,
  ],
})
export class DeveloperModule {}
