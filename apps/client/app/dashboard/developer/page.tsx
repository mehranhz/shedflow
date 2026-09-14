import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@shedflow/ui/components";

import { PageHeader } from "@/components/page-header";

export default function DeveloperPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Developer"
        description="API keys and webhooks for Pro workspaces."
      />
      <Alert>
        <AlertTitle>Coming with the developer API</AlertTitle>
        <AlertDescription>
          Create keys and subscribe to booking.confirmed once T-033 lands. Upgrade to Pro to unlock this tab.
        </AlertDescription>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhook endpoints</CardTitle>
          <CardDescription>No endpoints yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            HMAC-signed deliveries will show up here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
