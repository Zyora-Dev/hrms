"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  KeyRound,
  Laptop,
  Loader2,
  LogOut,
  Save,
  ShieldCheck,
  ShieldOff,
  TriangleAlert,
  UserCog,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  changePassword,
  disableMfa,
  enableMfa,
  getAccount,
  listSessions,
  newBackupCodes,
  revokeOtherSessions,
  revokeSession,
  saveProfile,
  since,
  startMfa,
  type Account,
  type AdminSession,
  type MfaSetup,
} from "@/lib/account";
import { clearToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function AccountView() {
  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [now, setNow] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    getAccount()
      .then((a) => alive && setAccount(a))
      .catch(() => {});
    listSessions()
      .then((s) => {
        if (!alive) return;
        setSessions(s);
        // Read the clock once per load, not during render.
        setNow(Date.now());
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);

  if (!account) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProfileCard account={account} onSaved={setAccount} />
      <PasswordCard onChanged={refresh} />
      <MfaCard account={account} onChanged={refresh} />
      <SessionsCard
        sessions={sessions}
        now={now}
        onChanged={refresh}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Panel({
  icon: Icon,
  title,
  description,
  action,
  children,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  tone?: "ok" | "warn";
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            tone === "ok"
              ? "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20"
              : tone === "warn"
                ? "bg-amber-500/12 text-amber-700 ring-amber-500/20"
                : "bg-primary/12 text-brand-ink ring-primary/20",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function ProfileCard({
  account,
  onSaved,
}: {
  account: Account;
  onSaved: (a: Account) => void;
}) {
  const [name, setName] = useState(account.name ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      onSaved(await saveProfile(name.trim() || null));
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      icon={UserCog}
      title="Your account"
      description="The name shown beside your actions in the audit trail."
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Email</Label>
          <Input value={account.email} disabled className="h-9 text-sm" />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="h-9" disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function PasswordCard({ onChanged }: { onChanged: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    setSaving(true);
    try {
      await changePassword(current, next);
      toast.success("Password changed — other devices were signed out");
      setCurrent("");
      setNext("");
      setConfirm("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not change it");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel
      icon={KeyRound}
      title="Password"
      description="At least 10 characters with a letter and a number. Changing it signs every other device out."
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Current password</Label>
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">New password</Label>
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Repeat it</Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={cn("h-9 text-sm", mismatch && "border-destructive")}
            />
            {mismatch && (
              <p className="text-[11px] text-destructive">
                These two do not match
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={saving || !current || next.length < 10 || mismatch}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Change password
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function MfaCard({
  account,
  onChanged,
}: {
  account: Account;
  onChanged: () => void;
}) {
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    try {
      setSetup(await startMfa());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not start");
    } finally {
      setBusy(false);
    }
  }

  async function turnOn() {
    setBusy(true);
    try {
      const result = await enableMfa(code.trim());
      setCodes(result.codes);
      setSetup(null);
      setCode("");
      toast.success("Two-step sign-in is on");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That code is not right");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!window.confirm("Turn off two-step sign-in? Your password alone will get in.")) {
      return;
    }
    setBusy(true);
    try {
      await disableMfa(password);
      setPassword("");
      setCodes(null);
      toast.success("Two-step sign-in is off");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Wrong password");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const result = await newBackupCodes(password);
      setCodes(result.codes);
      setPassword("");
      toast.success("New codes — the old ones no longer work");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Wrong password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      icon={account.totp_enabled ? ShieldCheck : ShieldOff}
      tone={account.totp_enabled ? "ok" : "warn"}
      title="Two-step sign-in"
      description={
        account.totp_enabled
          ? `On. A code from your authenticator is required after your password. ${account.backup_codes_left} backup code${account.backup_codes_left === 1 ? "" : "s"} left.`
          : "Off. Your password is the only thing standing between anyone and payroll."
      }
      action={
        !account.totp_enabled && !setup ? (
          <Button size="sm" className="h-8 text-xs" onClick={begin} disabled={busy}>
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="size-3.5" />
            )}
            Turn on
          </Button>
        ) : null
      }
    >
      {setup && (
        <div className="grid gap-5 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:grid-cols-[auto_1fr]">
          <Image
            src={setup.qr_png}
            alt="Scan this with your authenticator app"
            width={160}
            height={160}
            unoptimized
            className="rounded-lg border border-border bg-white p-2"
          />
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold">
                1. Scan the square with Google Authenticator, Authy or 1Password
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Can&rsquo;t scan? Enter this key by hand:
              </p>
              <code className="mt-1 block break-all rounded bg-card px-2 py-1 font-mono text-[11px]">
                {setup.secret}
              </code>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                2. Type the six-digit code it shows
              </Label>
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  className="h-9 w-32 text-sm"
                />
                <Button
                  onClick={turnOn}
                  disabled={busy || code.trim().length < 6}
                  className="h-9"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Confirm
                </Button>
                <Button
                  variant="ghost"
                  className="h-9"
                  onClick={() => {
                    setSetup(null);
                    setCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {codes && <BackupCodes codes={codes} onDone={() => setCodes(null)} />}

      {account.totp_enabled && !codes && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Confirm your password to make changes
            </Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 w-56 text-sm"
              autoComplete="current-password"
            />
          </div>
          <Button
            variant="outline"
            className="h-9"
            disabled={busy || !password}
            onClick={regenerate}
          >
            New backup codes
          </Button>
          <Button
            variant="ghost"
            className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy || !password}
            onClick={turnOff}
          >
            <ShieldOff className="size-4" />
            Turn off
          </Button>
        </div>
      )}
    </Panel>
  );
}

function BackupCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold">
        <TriangleAlert className="size-4 text-amber-700" />
        Save these somewhere safe — they are shown once
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Each one signs you in a single time if you lose your phone.
      </p>

      <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        {codes.map((code) => (
          <li
            key={code}
            className="rounded bg-card px-2 py-1.5 text-center font-mono text-xs font-semibold"
          >
            {code}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={() => {
            navigator.clipboard.writeText(codes.join("\n"));
            setCopied(true);
            toast.success("Copied");
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          Copy all
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onDone}>
          I have saved them
        </Button>
      </div>
    </div>
  );
}

function SessionsCard({
  sessions,
  now,
  onChanged,
}: {
  sessions: AdminSession[];
  now: number;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const others = sessions.filter((s) => !s.is_current).length;

  async function signOut(id: number) {
    setBusy(true);
    try {
      await revokeSession(id);
      toast.success("Device signed out");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not sign it out");
    } finally {
      setBusy(false);
    }
  }

  async function signOutOthers() {
    setBusy(true);
    try {
      await revokeOtherSessions();
      toast.success("Every other device was signed out");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not sign them out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      icon={Laptop}
      title="Where you are signed in"
      description="Each device that holds a live session. Signing one out stops its next request."
      action={
        others > 0 ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy}
            onClick={signOutOthers}
          >
            <LogOut className="size-3.5" />
            Sign out {others} other{others === 1 ? "" : "s"}
          </Button>
        ) : null
      }
    >
      <ul className="divide-y divide-border/50">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center gap-3 py-3">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                session.is_current
                  ? "bg-emerald-500/12 text-emerald-700"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <Laptop className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                {session.device ?? "Unknown device"}
                {session.is_current && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    This device
                  </span>
                )}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {session.ip_address ?? "unknown address"} · active{" "}
                {now ? since(session.last_seen_at, now) : "recently"}
              </p>
            </div>

            {session.is_current ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  clearToken();
                  router.replace("/admin/login");
                }}
              >
                <LogOut className="size-3.5" />
                Sign out
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={busy}
                onClick={() => signOut(session.id)}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
