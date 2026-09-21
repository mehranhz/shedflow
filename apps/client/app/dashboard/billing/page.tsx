"use client";

import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { QueryError } from "@/components/query-state";
import { useOrg } from "@/components/org-provider";
import { billingApi, orgsApi } from "@/lib/scheduling";

function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}

export default function BillingPage() {
  const t = useTranslations("dashboard.billing");
  const { organization } = useOrg();
  const queryClient = useQueryClient();
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState<"ONE_TIME" | "RECURRING">("ONE_TIME");
  const [priceAmount, setPriceAmount] = useState("120");
  const [priceProductId, setPriceProductId] = useState("");
  const [priceInterval, setPriceInterval] = useState<"month" | "year">("month");
  const stripeTax = Boolean(
    (organization.settings as { stripeTax?: boolean } | undefined)?.stripeTax,
  );

  const status = useQuery({
    queryKey: ["connect-status", organization.id],
    queryFn: () => billingApi.connectStatus(organization.id),
  });

  const products = useQuery({
    queryKey: ["billing-products", organization.id],
    queryFn: () => billingApi.listProducts(organization.id),
    enabled: organization.platformPlan === "PRO",
  });

  const upgrade = useMutation({
    mutationFn: () => billingApi.upgrade(organization.id, interval),
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("upgradeUnavailable"));
    },
  });

  const portal = useMutation({
    mutationFn: () => billingApi.portal(organization.id),
    onSuccess: (result) => {
      if (!result?.url) {
        toast.message(t("portalSoon"));
        return;
      }
      window.location.href = result.url;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("portalUnavailable"));
    },
  });

  const onboard = useMutation({
    mutationFn: () => billingApi.onboard(organization.id),
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("onboardFailed"));
    },
  });

  const dashboard = useMutation({
    mutationFn: () => billingApi.dashboardLink(organization.id),
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("stripeFailed"));
    },
  });

  const createProduct = useMutation({
    mutationFn: () =>
      billingApi.createProduct(organization.id, {
        name: productName.trim(),
        type: productType,
        creditGrantPerPeriod: productType === "RECURRING" ? 4 : 0,
      }),
    onSuccess: async () => {
      toast.success(t("productCreated"));
      setProductName("");
      await queryClient.invalidateQueries({
        queryKey: ["billing-products", organization.id],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("productFailed"));
    },
  });

  const createPrice = useMutation({
    mutationFn: () => {
      const dollars = Number(priceAmount);
      const product = productRows.find((item) => item.id === priceProductId);
      if (!priceProductId || !Number.isFinite(dollars) || dollars <= 0) {
        throw new Error(t("pickProduct"));
      }
      return billingApi.createPrice(organization.id, priceProductId, {
        amountMinor: Math.round(dollars * 100),
        currency: organization.currency || "USD",
        interval: product?.type === "RECURRING" ? priceInterval : undefined,
      });
    },
    onSuccess: async () => {
      toast.success(t("priceCreated"));
      setPriceAmount("120");
      await queryClient.invalidateQueries({
        queryKey: ["billing-products", organization.id],
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("priceFailed"));
    },
  });

  const toggleTax = useMutation({
    mutationFn: async (enabled: boolean) => {
      await orgsApi.update(organization.id, {
        settings: {
          ...organization.settings,
          stripeTax: enabled,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("taxSaved"));
      // Soft refresh so activeOrganization picks up settings.
      window.location.reload();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("taxFailed"));
    },
  });

  const productRows = products.data ?? [];
  const productsUnavailable = products.data === null && !products.isLoading && !products.isError;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{t("planTitle")}</CardTitle>
            <CardDescription>{t("planBody")}</CardDescription>
          </div>
          <Badge>{organization.platformPlan}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {organization.platformPlan === "FREE" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={interval}
                  onValueChange={(value: string) =>
                    setInterval(value as "month" | "year")
                  }
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">{t("priceMonth")}</SelectItem>
                    <SelectItem value="year">{t("priceYear")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => upgrade.mutate()} disabled={upgrade.isPending}>
                  {upgrade.isPending ? t("upgrading") : t("upgradeCta")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("upgradeHint")}</p>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <p className="w-full text-sm text-muted-foreground">{t("onPro")}</p>
              <Button
                variant="outline"
                onClick={() => portal.mutate()}
                disabled={portal.isPending}
              >
                {t("manageSubscription")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("connectTitle")}</CardTitle>
          <CardDescription>{t("connectBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.isError ? (
            <QueryError
              message={
                status.error instanceof Error
                  ? status.error.message
                  : t("connectLoadFailed")
              }
              onRetry={() => void status.refetch()}
            />
          ) : null}
          {status.data ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant={status.data.chargesEnabled ? "default" : "secondary"}>
                {status.data.chargesEnabled ? t("chargesEnabled") : t("chargesPending")}
              </Badge>
              <Badge variant={status.data.payoutsEnabled ? "default" : "secondary"}>
                {status.data.payoutsEnabled ? t("payoutsEnabled") : t("payoutsPending")}
              </Badge>
              <Badge variant={status.data.detailsSubmitted ? "default" : "secondary"}>
                {status.data.detailsSubmitted
                  ? t("detailsSubmitted")
                  : t("detailsIncomplete")}
              </Badge>
            </div>
          ) : !status.isLoading && !status.isError ? (
            <Alert>
              <AlertTitle>{t("billingOfflineTitle")}</AlertTitle>
              <AlertDescription>{t("billingOfflineBody")}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => onboard.mutate()}
              disabled={onboard.isPending}
            >
              {onboard.isPending ? t("opening") : t("connectStripe")}
            </Button>
            {status.data?.detailsSubmitted ? (
              <Button
                variant="ghost"
                onClick={() => dashboard.mutate()}
                disabled={dashboard.isPending}
              >
                {t("openExpress")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("taxTitle")}</CardTitle>
          <CardDescription>{t("taxBody")}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{t("taxToggle")}</p>
            <p className="text-xs text-muted-foreground">{t("taxHint")}</p>
          </div>
          <Switch
            checked={stripeTax}
            disabled={toggleTax.isPending}
            onCheckedChange={(checked: boolean) => toggleTax.mutate(checked)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("catalogTitle")}</CardTitle>
          <CardDescription>{t("catalogBody")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {organization.platformPlan === "FREE" ? (
            <p className="text-sm text-muted-foreground">{t("catalogUpgrade")}</p>
          ) : productsUnavailable ? (
            <Alert>
              <AlertTitle>{t("catalogOfflineTitle")}</AlertTitle>
              <AlertDescription>{t("catalogOfflineBody")}</AlertDescription>
            </Alert>
          ) : null}

          {productRows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colProduct")}</TableHead>
                    <TableHead>{t("colType")}</TableHead>
                    <TableHead>{t("colPrices")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productRows.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(product.prices ?? []).length === 0
                          ? t("noPrices")
                          : product.prices
                              ?.map((price) =>
                                [
                                  formatMoney(price.amountMinor, price.currency),
                                  price.interval ? `/${price.interval}` : "",
                                ].join(""),
                              )
                              .join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : organization.platformPlan === "PRO" && !productsUnavailable ? (
            <p className="text-sm text-muted-foreground">{t("noProducts")}</p>
          ) : null}

          {organization.platformPlan === "PRO" ? (
            <div className="grid gap-4 border-t pt-4">
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
                <Input
                  id="billing-product-name"
                  placeholder={t("productNamePlaceholder")}
                  aria-label={t("productNamePlaceholder")}
                  value={productName}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setProductName(event.target.value)
                  }
                />
                <Select
                  value={productType}
                  onValueChange={(value: string) =>
                    setProductType(value as "ONE_TIME" | "RECURRING")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ONE_TIME">{t("oneTime")}</SelectItem>
                    <SelectItem value="RECURRING">{t("membership")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => createProduct.mutate()}
                  disabled={createProduct.isPending || !productName.trim()}
                >
                  {t("addProduct")}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
                <Select value={priceProductId} onValueChange={setPriceProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("attachPrice")} />
                  </SelectTrigger>
                  <SelectContent>
                    {productRows.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  inputMode="decimal"
                  value={priceAmount}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setPriceAmount(event.target.value)
                  }
                  aria-label={t("amount")}
                />
                <Select
                  value={priceInterval}
                  onValueChange={(value: string) =>
                    setPriceInterval(value as "month" | "year")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">{t("monthly")}</SelectItem>
                    <SelectItem value="year">{t("yearly")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => createPrice.mutate()}
                  disabled={createPrice.isPending || !priceProductId}
                >
                  {t("addPrice")}
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("paymentsTitle")}</CardTitle>
          <CardDescription>{t("paymentsBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colWhen")}</TableHead>
                  <TableHead>{t("colAmount")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={3} className="text-sm text-muted-foreground">
                    {t("noPayments")}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
