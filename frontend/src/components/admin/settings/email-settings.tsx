"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  flushOutbox,
  getEmailSettings,
  listOutbox,
  retryEmail,
  saveEmailSettings,
  sendTestEmail,
  type EmailMessage,
  type EmailSettings,
  type EmailSettingsPayload,
} from "@/lib/email";
import { cn } from "@/lib/utils";

const EVENTS: { key: keyof EmailSettingsPayload; label: string; hint: string }[] =
  [
    {
      key: "send_payslips",
      label: "Payslips",
      hint: "Sent to each employee when a month's payroll is approved.",
    },
    {
      key: "send_leave_decisions",
      label: "Leave decisions",
      hint: "Tells the employee when their leave is approved or rejected.",
    },
    {
      key: "send_claim_decisions",
      label: "Expense decisions",
      hint: "Tells the employee what was approved and how it will be settled.",
    },
    {
      key: "send_portal_invites",
      label: "Sign-in details",
      hint: "Sends the password when you give someone portal or console access.",
    },
    {
      key: "send_admin_alerts",
      label: "Admin alerts",
      hint: "Mail to you when an employee applies for leave or claims an expense.",
    },
  ];

function toPayload(s: EmailSettings): EmailSettingsPayload {
  return {
    is_enabled: s.is_enabled,
    from_name: s.from_name,
    from_email: s.from_email,
    reply_to: s.reply_to,
    redirect_to: s.redirect_to,
    send_payslips: s.send_payslips,
    send_leave_decisions: s.send_leave_decisions,
    send_claim_decisions: s.send_claim_decisions,
    send_portal_invites: s.send_portal_invites,
    send_admin_alerts: s.send_admin_alerts,
  };
}

export function EmailSettingsPanel() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [form, setForm] = useState<EmailSettingsPayload | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | "flush" | null>(null);
  const [testTo, setTestTo] = useState("");
  const [outbox, setOutbox] = useState<EmailMessage[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    getEmailSettings()
      .then((s) => {
        setSettings(s);
        setForm(toPayload(s));
      })
      .catch(() => {});
    listOutbox()
      .then(setOutbox)
      .catch(() => setOutbox([]));
  }, [reloadKey]);

  function set<K extends keyof EmailSettingsPayload>(
    key: K,
    value: EmailSettingsPayload[K],
  ) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setDirty(true);
  }

  async function save() {
    if (!form) return;
    setBusy("save");
    try {
      const saved = await saveEmailSettings(form);
      setSettings(saved);
      setDirty(false);
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    try {
      const result = await sendTestEmail(testTo.trim());
      toast.success(result.message);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "It did not send");
    } finally {
      setBusy(null);
    }
  }

  async function flush() {
    setBusy("flush");
    try {
      const result = await flushOutbox();
      toast.success(
        result.sent || result.failed
          ? `${result.sent} sent, ${result.failed} failed`
          : "Nothing waiting",
      );
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send");
    } finally {
      setBusy(null);
    }
  }

  if (!settings || !form) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
        <header className="mb-5 flex flex-wrap items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
              settings.provider_ready
                ? "bg-emerald-500/12 text-emerald-700 ring-emerald-500/20"
                : "bg-amber-500/12 text-amber-700 ring-amber-500/20",
            )}
          >
            <Mail className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">Outgoing email</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground/70">
              Mail goes out through Zoho CPaaS. The key and the sending address
              live in the server&rsquo;s <span className="font-mono">.env</span>{" "}
              — not here, because a key that can send mail as the company should
              not be editable from a browser.
            </p>
          </div>
          <Switch
            checked={form.is_enabled}
            onCheckedChange={(v) => set("is_enabled", v)}
            aria-label="Send email"
          />
        </header>

        <div
          className={cn(
            "mb-5 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-xs",
            settings.provider_ready
              ? "bg-emerald-500/10 text-emerald-900"
              : "bg-amber-500/10 text-amber-900",
          )}
        >
          {settings.provider_ready ? (
            <CheckCircle2 className="mt-px size-4 shrink-0" />
          ) : (
            <AlertCircle className="mt-px size-4 shrink-0" />
          )}
          <span>
            {settings.provider_ready ? (
              <>
                Configured. Sending as{" "}
                <span className="font-semibold">
                  {settings.from_email || settings.env_from_address}
                </span>{" "}
                through <span className="font-mono">{settings.provider_url}</span>.
              </>
            ) : (
              <>
                Not configured yet. Set{" "}
                <span className="font-mono">ZOHO_CPAAS_KEY</span> and{" "}
                <span className="font-mono">MAIL_FROM_ADDRESS</span> in{" "}
                <span className="font-mono">backend/.env</span>, then restart the
                API. Messages queue in the meantime and go out once it works.
              </>
            )}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="From name"
            value={form.from_name ?? ""}
            onChange={(v) => set("from_name", v || null)}
            placeholder="HRMS"
          />
          <Field
            label="From address"
            value={form.from_email ?? ""}
            onChange={(v) => set("from_email", v || null)}
            placeholder={settings.env_from_address ?? "hr@company.com"}
            hint="Overrides the one in .env"
          />
          <Field
            label="Reply to"
            value={form.reply_to ?? ""}
            onChange={(v) => set("reply_to", v || null)}
            placeholder="people@company.com"
          />
          <Field
            label="Send everything to"
            value={form.redirect_to ?? ""}
            onChange={(v) => set("redirect_to", v || null)}
            placeholder="Leave blank in normal use"
            hint="For testing: every message goes here instead"
          />
        </div>

        <div className="mt-5 space-y-3 border-t border-border/50 pt-5">
          {EVENTS.map((event) => (
            <label
              key={event.key}
              className="flex cursor-pointer items-start justify-between gap-4"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{event.label}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-foreground/70">
                  {event.hint}
                </span>
              </span>
              <Switch
                checked={Boolean(form[event.key])}
                onCheckedChange={(v) => set(event.key, v as never)}
                aria-label={event.label}
              />
            </label>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border/50 pt-5">
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Send a test to</Label>
              <Input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@company.com"
                className="h-9 w-64 text-sm"
              />
            </div>
            <Button
              variant="outline"
              className="h-9"
              disabled={busy !== null || !testTo.trim()}
              onClick={test}
            >
              {busy === "test" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Send test
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-foreground/70">Unsaved changes</span>
            )}
            <Button className="h-9" disabled={!dirty || busy !== null} onClick={save}>
              {busy === "save" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
        <header className="mb-4 flex flex-wrap items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
            <Inbox className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">Outbox</h2>
            <p className="mt-0.5 text-xs text-foreground/70">
              {settings.queued} waiting · {settings.failed} failed ·{" "}
              {settings.sent_today} sent in the last day. Nothing is sent inside
              the request that caused it, so a mail problem never blocks the app.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy !== null}
            onClick={flush}
          >
            {busy === "flush" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Send now
          </Button>
        </header>

        {!outbox ? (
          <Skeleton className="h-28 w-full rounded-lg" />
        ) : outbox.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-foreground/80">
            Nothing has been queued yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {outbox.slice(0, 15).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                    row.status === "sent"
                      ? "bg-emerald-500/15 text-emerald-800"
                      : row.status === "failed"
                        ? "bg-destructive/15 text-destructive"
                        : "bg-amber-500/20 text-amber-800",
                  )}
                >
                  {row.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{row.subject}</p>
                  <p className="truncate text-[11px] text-foreground/70">
                    {row.to_email} · {row.created_at.slice(0, 16).replace("T", " ")}
                    {row.attempts > 0 && ` · ${row.attempts} attempt(s)`}
                  </p>
                  {row.last_error && (
                    <p className="mt-0.5 text-[11px] text-destructive">
                      {row.last_error}
                    </p>
                  )}
                </div>
                {row.status !== "sent" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={async () => {
                      await retryEmail(row.id).catch(() =>
                        toast.error("Still not going"),
                      );
                      setReloadKey((k) => k + 1);
                    }}
                  >
                    Retry
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 text-sm"
      />
      {hint && <p className="text-[11px] text-foreground/70">{hint}</p>}
    </div>
  );
}
