"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  DatabaseBackup,
  Download,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  UserCog,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { IconButton } from "@/components/admin/icon-button";
import {
  ApiError,
  deleteBackup,
  downloadBackup,
  fileSize,
  inviteMember,
  listBackups,
  listModules,
  listTeam,
  removeMember,
  takeBackup,
  updateMember,
  type Backup,
  type PermissionLevel,
  type PermissionModule,
  type TeamMember,
} from "@/lib/team";
import { cn } from "@/lib/utils";

const LEVELS: { value: PermissionLevel; label: string }[] = [
  { value: "none", label: "None" },
  { value: "read", label: "Read" },
  { value: "write", label: "Write" },
];

export function TeamSettingsPanel() {
  const [modules, setModules] = useState<PermissionModule[]>([]);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    listModules()
      .then(setModules)
      .catch(() => setModules([]));
  }, []);

  useEffect(() => {
    listTeam()
      .then(setTeam)
      .catch(() => setTeam([]));
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
        <header className="mb-5 flex flex-wrap items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
            <UserCog className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">Admin users</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground/70">
              An owner can do everything. Anyone else gets exactly the modules
              you grant: read to look, write to change. Removing access ends
              their sessions immediately.
            </p>
          </div>
          {!inviting && (
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => setInviting(true)}
            >
              <Plus className="size-3.5" />
              Add sub-admin
            </Button>
          )}
        </header>

        {issued && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-xs font-bold">
              Give this to {issued.email} — shown once
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="rounded bg-card px-2.5 py-1.5 font-mono text-sm font-semibold">
                {issued.password}
              </code>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(issued.password);
                  toast.success("Copied");
                }}
              >
                <Copy className="size-3.5" />
                Copy
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setIssued(null)}
              >
                Done
              </Button>
            </div>
          </div>
        )}

        {inviting && (
          <InviteForm
            modules={modules}
            onCancel={() => setInviting(false)}
            onDone={(member) => {
              setInviting(false);
              if (member.temporary_password) {
                setIssued({
                  email: member.email,
                  password: member.temporary_password,
                });
              }
              reload();
            }}
          />
        )}

        {!team ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          <ul className="space-y-3">
            {team.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                modules={modules}
                onChanged={reload}
                onPassword={(password) =>
                  setIssued({ email: member.email, password })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <BackupsPanel />
    </div>
  );
}

function MemberRow({
  member,
  modules,
  onChanged,
  onPassword,
}: {
  member: TeamMember;
  modules: PermissionModule[];
  onChanged: () => void;
  onPassword: (password: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [grants, setGrants] = useState<Record<string, PermissionLevel>>(
    () => (member.permissions as Record<string, PermissionLevel>) ?? {},
  );
  const [busy, setBusy] = useState(false);

  const owner = member.role === "owner";
  const granted = Object.entries(member.permissions ?? {});

  async function save(body: Parameters<typeof updateMember>[1], done: string) {
    setBusy(true);
    try {
      const saved = await updateMember(member.id, body);
      toast.success(done);
      if (saved.temporary_password) onPassword(saved.temporary_password);
      setEditing(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const password = window.prompt(
      `New password for ${member.email} (at least 10 characters, with a letter and a number)`,
    );
    if (!password) return;
    await save({ password }, "Password reset");
  }

  async function remove() {
    if (!window.confirm(`Remove ${member.email}? They lose access at once.`)) {
      return;
    }
    setBusy(true);
    try {
      await removeMember(member.id);
      toast.success("Removed");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
            owner
              ? "bg-primary/12 text-brand-ink"
              : member.is_active
                ? "bg-emerald-500/12 text-emerald-700"
                : "bg-muted text-foreground/60",
          )}
        >
          {member.email.slice(0, 2).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
            {member.name || member.email}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                owner
                  ? "bg-primary/15 text-brand-ink"
                  : "bg-muted text-foreground/70",
              )}
            >
              {member.role}
            </span>
            {member.totp_enabled && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                <ShieldCheck className="size-3" />
                2FA
              </span>
            )}
            {!member.is_active && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                Switched off
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-foreground/70">
            {member.email}
            {member.invited_by ? ` · added by ${member.invited_by}` : ""}
            {member.last_seen_at
              ? ` · last seen ${member.last_seen_at.slice(0, 10)}`
              : " · never signed in"}
          </p>

          {!editing && (
            <p className="mt-2 flex flex-wrap gap-1.5">
              {owner ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-brand-ink">
                  Everything
                </span>
              ) : granted.length === 0 ? (
                <span className="text-[11px] text-foreground/70">
                  No access granted yet
                </span>
              ) : (
                granted.map(([key, level]) => (
                  <span
                    key={key}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      level === "write"
                        ? "bg-emerald-500/15 text-emerald-800"
                        : "bg-muted text-foreground/75",
                    )}
                  >
                    {modules.find((m) => m.key === key)?.label ?? key} · {level}
                  </span>
                ))
              )}
            </p>
          )}
        </div>

        {!owner && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? "Cancel" : "Permissions"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={busy}
              onClick={reset}
            >
              Reset password
            </Button>
            <IconButton
              label={member.is_active ? "Switch off" : "Switch on"}
              icon={member.is_active ? UserX : Check}
              size="sm"
              variant="neutral"
              disabled={busy}
              onClick={() =>
                save(
                  { is_active: !member.is_active },
                  member.is_active ? "Access switched off" : "Access restored",
                )
              }
            />
            <IconButton
              label="Remove"
              icon={Trash2}
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={remove}
            />
          </div>
        )}
      </div>

      {editing && !owner && (
        <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
          <PermissionGrid
            modules={modules}
            value={grants}
            onChange={setGrants}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={busy}
              onClick={() => save({ permissions: grants }, "Permissions saved")}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Save permissions
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function PermissionGrid({
  modules,
  value,
  onChange,
}: {
  modules: PermissionModule[];
  value: Record<string, PermissionLevel>;
  onChange: (next: Record<string, PermissionLevel>) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {modules.map((module) => {
        const level = value[module.key] ?? "none";
        return (
          <li
            key={module.key}
            className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-xs font-semibold">
              {module.label}
            </span>
            <div className="flex gap-1">
              {LEVELS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    onChange({ ...value, [module.key]: option.value })
                  }
                  className={cn(
                    "h-7 rounded-md px-2.5 text-[11px] font-semibold transition-colors",
                    level === option.value
                      ? "bg-brand-ink text-white"
                      : "bg-card text-foreground/75 hover:bg-accent",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function InviteForm({
  modules,
  onCancel,
  onDone,
}: {
  modules: PermissionModule[];
  onCancel: () => void;
  onDone: (member: TeamMember) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [grants, setGrants] = useState<Record<string, PermissionLevel>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const member = await inviteMember({
        email: email.trim(),
        name: name.trim() || null,
        password: password.trim() || null,
        permissions: grants,
      });
      toast.success("Sub-admin added");
      onDone(member);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not add them");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-5 space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Email</Label>
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hr@company.com"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Password</Label>
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to generate one"
            className="h-9 text-sm"
          />
        </div>
      </div>

      <PermissionGrid modules={modules} value={grants} onChange={setGrants} />

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={onCancel}
          disabled={busy}
        >
          <X className="size-3.5" />
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-8 text-xs"
          disabled={busy || !email.trim()}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Add sub-admin
        </Button>
      </div>
    </form>
  );
}

function BackupsPanel() {
  const [rows, setRows] = useState<Backup[] | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    listBackups()
      .then(setRows)
      .catch(() => setRows([]));
  }

  useEffect(reload, []);

  async function take() {
    setBusy(true);
    try {
      const made = await takeBackup();
      toast.success(`Backup taken · ${fileSize(made.size_bytes)}`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
          <DatabaseBackup className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-foreground">Backups</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/70">
            A complete dump of the database, restorable with{" "}
            <span className="font-mono">pg_restore</span>. Download it
            somewhere else — a backup sitting on the same machine is not a
            backup.
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={take}>
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <DatabaseBackup className="size-3.5" />
          )}
          Back up now
        </Button>
      </header>

      {!rows ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-foreground/80">
          No backups yet.
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((backup) => (
            <li key={backup.name} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-semibold">
                  {backup.name}
                </p>
                <p className="text-[11px] text-foreground/70">
                  {fileSize(backup.size_bytes)} ·{" "}
                  {backup.created_at.slice(0, 16).replace("T", " ")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() =>
                  downloadBackup(backup.name).catch(() =>
                    toast.error("Could not download it"),
                  )
                }
              >
                <Download className="size-3.5" />
                Download
              </Button>
              <IconButton
                label="Delete backup"
                icon={Trash2}
                size="sm"
                variant="destructive"
                onClick={async () => {
                  if (!window.confirm(`Delete ${backup.name}?`)) return;
                  await deleteBackup(backup.name).catch(() =>
                    toast.error("Could not delete it"),
                  );
                  reload();
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
