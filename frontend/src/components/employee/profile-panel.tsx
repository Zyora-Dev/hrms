"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL } from "@/lib/auth";
import {
  employeeChangePassword,
  myProfile,
  type MyProfile,
} from "@/lib/employee-auth";
import { Card } from "./portal-panels";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function longDate(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function titleCase(value: string | null) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function Avatar({
  photo,
  name,
  size = 40,
}: {
  photo: string | null;
  name: string | null;
  size?: number;
}) {
  const initials = (name ?? "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (photo) {
    return (
      // A plain img: the file is served by the API, not the Next host, and
      // the admin side renders photos the same way.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${API_URL}${photo}`}
        alt={name ?? "Profile photo"}
        className="shrink-0 rounded-full object-cover ring-1 ring-border"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/12 font-bold text-brand-ink ring-1 ring-primary/20"
      style={{ width: size, height: size, fontSize: size / 2.8 }}
    >
      {initials}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold text-foreground/70">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <h2 className="mb-4 text-sm font-bold">{title}</h2>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

export function ProfilePanel() {
  const [me, setMe] = useState<MyProfile | null>(null);

  useEffect(() => {
    let alive = true;
    myProfile()
      .then((p) => alive && setMe(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!me) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border/60 bg-card p-5">
        <Avatar photo={me.photo_path} name={me.full_name} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">
            {me.full_name}
          </h1>
          <p className="mt-0.5 text-sm text-foreground/80">
            {[me.designation, me.department].filter(Boolean).join(" · ") || "—"}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full bg-primary/12 px-2 py-0.5 font-mono font-semibold text-brand-ink">
              {me.employee_code}
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold capitalize text-emerald-800">
              {titleCase(me.status)}
            </span>
            <span className="text-foreground/70">
              Joined {longDate(me.date_of_joining)}
            </span>
          </p>
        </div>
      </section>

      <Group title="Personal">
        <Row label="Date of birth" value={longDate(me.date_of_birth)} />
        <Row label="Gender" value={titleCase(me.gender)} />
        <Row label="Blood group" value={me.blood_group} />
        <Row label="Marital status" value={titleCase(me.marital_status)} />
      </Group>

      <Group title="Contact">
        <Row label="Work email" value={me.work_email} />
        <Row label="Personal email" value={me.personal_email} />
        <Row label="Mobile" value={me.phone} />
        <Row label="Alternate phone" value={me.alternate_phone} />
        <Row label="Current address" value={me.current_address} />
        <Row label="Permanent address" value={me.permanent_address} />
        <Row
          label="Emergency contact"
          value={
            me.emergency_contact_name
              ? `${me.emergency_contact_name}${
                  me.emergency_contact_relation
                    ? ` (${me.emergency_contact_relation})`
                    : ""
                }`
              : null
          }
        />
        <Row label="Emergency phone" value={me.emergency_contact_phone} />
      </Group>

      <Group title="Employment">
        <Row label="Designation" value={me.designation} />
        <Row label="Department" value={me.department} />
        <Row label="Employment type" value={titleCase(me.employment_type)} />
        <Row label="Work location" value={me.work_location} />
        <Row label="Reporting manager" value={me.reporting_manager} />
        <Row label="Shift" value={me.shift_name} />
        <Row label="Date of joining" value={longDate(me.date_of_joining)} />
        <Row label="Probation ends" value={longDate(me.probation_end_date)} />
      </Group>

      <Group title="Statutory & bank">
        <Row label="PAN" value={me.pan} />
        <Row label="Aadhaar" value={me.aadhaar_masked} />
        <Row label="UAN" value={me.uan} />
        <Row label="PF number" value={me.pf_number} />
        <Row label="ESIC number" value={me.esic_number} />
        <Row label="Bank" value={me.bank_name} />
        <Row label="Account" value={me.bank_account_masked} />
        <Row label="IFSC" value={me.bank_ifsc} />
      </Group>

      <p className="px-1 text-[11px] text-foreground/70">
        Something wrong here? Ask your HR team — these details can only be
        changed by them.
      </p>
    </div>
  );
}

export function SettingsPanel({ lastLogin }: { lastLogin?: string | null }) {
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
      await employeeChangePassword(current, next);
      toast.success("Password changed — your other devices were signed out");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change it");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Password"
        description="At least 10 characters with a letter and a number. Changing it signs your other devices out."
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
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">New password</Label>
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Repeat it</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className={`h-9 ${mismatch ? "border-destructive" : ""}`}
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
      </Card>

      <Card title="Sign-in" description="How your account is being used.">
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
          <ShieldCheck className="size-4 text-emerald-700" />
          <p className="text-xs">
            Last signed in{" "}
            <span className="font-semibold">
              {lastLogin ? lastLogin.slice(0, 16).replace("T", " ") : "just now"}
            </span>
            . If that was not you, change your password and tell HR.
          </p>
        </div>
      </Card>
    </div>
  );
}
