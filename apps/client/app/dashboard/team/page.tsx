"use client";

import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@shedflow/ui/components";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { QueryError, TableSkeleton } from "@/components/query-state";
import { canManageWorkspace, useOrg } from "@/components/org-provider";
import { orgsApi } from "@/lib/scheduling";
import type { Member } from "@/lib/types";

export default function TeamPage() {
  const t = useTranslations("dashboard.team");
  const { organization, profile, role } = useOrg();
  const queryClient = useQueryClient();
  const canManage = canManageWorkspace(role);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");

  const members = useQuery({
    queryKey: ["members", organization.id],
    queryFn: () => orgsApi.members(organization.id),
  });
  const invitations = useQuery({
    queryKey: ["invitations", organization.id],
    queryFn: () => orgsApi.invitations(organization.id),
  });

  const invite = useMutation({
    mutationFn: () => orgsApi.invite(organization.id, { email, role: inviteRole }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invitations", organization.id] });
      toast.success(t("invited", { email }));
      setEmail("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("inviteFailed"));
    },
  });

  const updateRole = useMutation({
    mutationFn: ({
      userId,
      nextRole,
    }: {
      userId: string;
      nextRole: "ADMIN" | "MEMBER";
    }) => orgsApi.updateMember(organization.id, userId, { role: nextRole }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["members", organization.id] });
      toast.success(t("roleUpdated"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("roleFailed"));
    },
  });

  const remove = useMutation({
    mutationFn: (userId: string) => orgsApi.removeMember(organization.id, userId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["members", organization.id] });
      toast.success(t("removed"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("removeFailed"));
    },
  });

  const revoke = useMutation({
    mutationFn: (invitationId: string) =>
      orgsApi.revokeInvitation(organization.id, invitationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invitations", organization.id] });
      toast.success(t("revoked"));
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("revokeFailed"));
    },
  });

  const canEditMember = (member: Member) =>
    canManage &&
    member.role !== "OWNER" &&
    member.userId !== profile.id;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("invite")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                invite.mutate();
              }}
            >
              <div className="grid flex-1 gap-2">
                <Label htmlFor="invite-email" className="sr-only">
                  {t("email")}
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setEmail(event.target.value)
                  }
                />
              </div>
              <Select
                value={inviteRole}
                onValueChange={(value: string) =>
                  setInviteRole(value as "ADMIN" | "MEMBER")
                }
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">{t("member")}</SelectItem>
                  <SelectItem value="ADMIN">{t("admin")}</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={invite.isPending || !email.trim()}>
                {invite.isPending ? t("sending") : t("sendInvite")}
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted-foreground">{t("inviteHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">{t("onlyAdmins")}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("members")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {members.isLoading ? <TableSkeleton /> : null}
          {members.error ? (
            <div className="px-6">
              <QueryError
                message={
                  members.error instanceof Error
                    ? members.error.message
                    : t("loadFailed")
                }
                onRetry={() => void members.refetch()}
              />
            </div>
          ) : null}
          {!members.isLoading && !members.error ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colEmail")}</TableHead>
                  <TableHead>{t("colRole")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  {canManage ? <TableHead className="w-[180px]">{t("colActions")}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(members.data ?? []).map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      {canEditMember(member) ? (
                        <Select
                          value={member.role}
                          onValueChange={(value: string) =>
                            updateRole.mutate({
                              userId: member.userId,
                              nextRole: value as "ADMIN" | "MEMBER",
                            })
                          }
                        >
                          <SelectTrigger className="h-8 w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="MEMBER">MEMBER</SelectItem>
                            <SelectItem value="ADMIN">ADMIN</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{member.role}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{member.status}</TableCell>
                    {canManage ? (
                      <TableCell>
                        {canEditMember(member) ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={remove.isPending}
                            onClick={() => {
                              if (window.confirm(t("removeConfirm", { email: member.email }))) {
                                remove.mutate(member.userId);
                              }
                            }}
                          >
                            {t("remove")}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("pendingTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {(invitations.data ?? []).length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">{t("noPending")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colEmail")}</TableHead>
                  <TableHead>{t("colRole")}</TableHead>
                  <TableHead>{t("colExpires")}</TableHead>
                  {canManage ? (
                    <TableHead className="w-[120px]">{t("colActions")}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.data?.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>{invitation.role}</TableCell>
                    <TableCell>
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(invitation.id)}
                        >
                          {t("revoke")}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
