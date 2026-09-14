"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { useOrg } from "@/components/org-provider";
import { billingApi } from "@/lib/scheduling";

export default function BillingPage() {
  const { organization } = useOrg();
  const status = useQuery({
    queryKey: ["connect-status", organization.id],
    queryFn: () => billingApi.connectStatus(organization.id),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Billing"
        description="Collect payments on bookings and manage your SchedFlow plan."
      />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">SchedFlow plan</CardTitle>
            <CardDescription>
              Free includes 3 event types. Pro unlocks paid bookings, branding, and the API.
            </CardDescription>
          </div>
          <Badge>{organization.platformPlan}</Badge>
        </CardHeader>
        <CardContent>
          {organization.platformPlan === "FREE" ? (
            <Button
              onClick={async () => {
                try {
                  const result = await billingApi.upgrade(organization.id);
                  window.location.href = result.url;
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Upgrade unavailable");
                }
              }}
            >
              Upgrade to Pro
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">You’re on Pro.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stripe Connect</CardTitle>
          <CardDescription>
            Connect an Express account so invitees can pay at checkout. Card numbers never touch SchedFlow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.data ? (
            <div className="flex gap-2 text-sm">
              <Badge variant={status.data.chargesEnabled ? "default" : "secondary"}>
                Charges {status.data.chargesEnabled ? "enabled" : "pending"}
              </Badge>
              <Badge variant={status.data.payoutsEnabled ? "default" : "secondary"}>
                Payouts {status.data.payoutsEnabled ? "enabled" : "pending"}
              </Badge>
            </div>
          ) : (
            <Alert>
              <AlertTitle>Billing service not connected</AlertTitle>
              <AlertDescription>
                Stripe onboarding will appear here once the billing API is running.
              </AlertDescription>
            </Alert>
          )}
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const result = await billingApi.onboard(organization.id);
                window.location.href = result.url;
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not start onboarding");
              }
            }}
          >
            Connect Stripe
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Products</CardTitle>
          <CardDescription>
            One-time session fees and memberships live here after Connect is complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No products yet.</p>
        </CardContent>
      </Card>
    </div>
  );
}
