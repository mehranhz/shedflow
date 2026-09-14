"use client";

import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { useOrg } from "@/components/org-provider";
import { orgsApi } from "@/lib/scheduling";

export default function TeamPage() {
  const { organization } = useOrg();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");

  const members = useQuery({
    queryKey: ["members", organization.id],
    queryFn: () => orgsApi.members(organization.id),
  });
  const invitations = useQuery({
    queryKey: ["invitations", organization.id],
    queryFn: () => orgsApi.invitations(organization.id),
  });

  const invite = useMutation({
    mutationFn: () => orgsApi.invite(organization.id, { email, role }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["invitations", organization.id] });
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Could not invite");
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Team" description="Invite teammates and manage roles." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite</CardTitle>
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
                Email
              </Label>
              <Input
                id="invite-email"
                type="email"
                required
                placeholder="teammate@company.com"
                value={email}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEmail(event.target.value)}
              />
            </div>
            <Select value={role} onValueChange={(value: string) => setRole(value as "ADMIN" | "MEMBER")}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" disabled={invite.isPending}>
              Send invite
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(members.data ?? []).map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{member.role}</Badge>
                  </TableCell>
                  <TableCell>{member.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {(invitations.data ?? []).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invitations</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
