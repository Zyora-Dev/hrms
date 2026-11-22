"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Loader2, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL, getToken } from "@/lib/auth";
import { ApiError } from "@/lib/company";
import { cn } from "@/lib/utils";

type Access = {
  employee_id: number;
  employee_code: string;
  portal_enabled: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  password_changed_at: string | null;
  temporary_password: string | null;
};

const headers = () => {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function handle(res: Response): Promise<Access> {
  const data = await res.json().catch(() => null);
  if (res.ok) return data as Access;
  const detail = data?.detail;
  throw new ApiError(
    Array.isArray(detail)
      ? String(detail[0]?.msg ?? "Invalid value")
      : typeof detail === "string"
        ? detail
        : "Something went wrong",
    res.status,
  );
}

function stamp(iso: string | null) {
  if (!iso) return "never";
  const [day, clock = ""] = iso.split("T");
  return `${day} ${clock.slice(0, 5)}`;
}

export function PortalAccess({ employeeId }: { employeeId: number }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/employees/${employeeId}/portal`, { headers: headers() })
      .then(handle)
      .then((a) => alive && setAccess(a))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [employeeId]);

  async function save(body: {
    enabled: boolean;
    password?: string | null;
    must_change_password?: boolean;
  }) {
    setBusy(true);
    try {
      const saved = await handle(
        await fetch(`${API_URL}/employees/${employeeId}/portal`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ must_change_password: true, ...body }),
        }),
      );
      setAccess(saved);
      setPassword("");
      setIssued(saved.temporary_password ?? (body.password ?? null));
      toast.success(
        body.enabled
          ? body.password || saved.temporary_password
            ? "Password set"
            : "Self-service access switched on"
          : "Self-service access switched off",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  if (!access) return <Skeleton className="h-28 w-full rounded-xl" />;

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            access.portal_enabled
              ? "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20"
              : "bg-muted text-foreground/60 ring-border",
          )}
        >
          <ShieldCheck className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Self-service access</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/70">
            {access.portal_enabled
              ? `On. Signs in at /employee/login with ${access.employee_code}. Last signed in ${stamp(access.last_login_at)}.`
              : "Off. Switch it on to give this employee a sign-in of their own."}
          </p>
        </div>
      </header>

      {issued && (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs font-semibold">
            Give this to {access.employee_code} — it is shown once
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded bg-card px-2.5 py-1.5 font-mono text-sm font-semibold">
              {issued}
            </code>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(issued);
                setCopied(true);
                toast.success("Copied");
              }}
            >
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
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
          <p className="mt-2 text-[11px] text-foreground/70">
            They will be asked to replace it the first time they sign in.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {access.portal_enabled ? (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Set a password (optional)
              </Label>
              <Input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank to generate one"
                className="h-9 w-64 text-sm"
              />
            </div>
            <Button
              variant="outline"
              className="h-9"
              disabled={busy}
              onClick={() => save({ enabled: true, password: password || null })}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Reset password
            </Button>
            <Button
              variant="ghost"
              className="h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => save({ enabled: false })}
            >
              <UserX className="size-4" />
              Switch off
            </Button>
          </>
        ) : (
          <Button
            className="h-9"
            disabled={busy}
            onClick={() => save({ enabled: true })}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Switch on and issue a password
          </Button>
        )}
      </div>
    </section>
  );
}
