"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  Fingerprint,
  Loader2,
  Plug,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  createDevice,
  deleteDevice,
  emptyDevice,
  fetchDevice,
  listDevices,
  testDevice,
  updateDevice,
  type Device,
  type DevicePayload,
  type DeviceTest,
} from "@/lib/devices";
import { cn } from "@/lib/utils";

function stamp(iso: string | null) {
  if (!iso) return "never";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1,
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

export function DeviceSettingsPanel() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [editing, setEditing] = useState<Device | "new" | null>(null);

  useEffect(() => {
    listDevices()
      .then(setDevices)
      .catch(() => setDevices([]));
  }, []);

  function replace(saved: Device) {
    setDevices((rows) => {
      const list = rows ?? [];
      return list.some((d) => d.id === saved.id)
        ? list.map((d) => (d.id === saved.id ? saved : d))
        : [...list, saved];
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
        <header className="mb-5 flex flex-wrap items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
            <Fingerprint className="size-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              Biometric terminals
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              eSSL and ZKTeco readers — an MB20ID among them — answer on TCP
              4370. Give the terminal a fixed IP on the same network as this
              server, then pull its log whenever you like. The same punch
              arriving twice is ignored.
            </p>
          </div>
          {editing === null && (
            <Button
              size="sm"
              className="h-8 text-xs"
              onClick={() => setEditing("new")}
            >
              <Plus className="size-3.5" />
              Add device
            </Button>
          )}
        </header>

        {editing !== null && (
          <DeviceForm
            device={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(saved) => {
              replace(saved);
              setEditing(null);
            }}
          />
        )}

        {devices === null ? (
          <Skeleton className="h-28 w-full rounded-xl" />
        ) : devices.length === 0 && editing === null ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-xs text-muted-foreground">
            No terminal registered yet. Punches can still be imported from CSV
            or added by hand.
          </p>
        ) : (
          <ul className="space-y-3">
            {devices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                onEdit={() => setEditing(device)}
                onChanged={replace}
                onRemoved={() =>
                  setDevices((rows) =>
                    (rows ?? []).filter((d) => d.id !== device.id),
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border/60 bg-muted/30 p-5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Matching people to the terminal
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          A terminal records a user number, not a name. Enrol people under
          their employee code and they are matched on sight; a plain number is
          matched against the digits in the code, so user 7 finds EMP-0007. For
          anything else, set the exact number on the employee&rsquo;s profile.
          Punches from a number nobody owns are reported after each fetch
          rather than silently dropped.
        </p>
      </section>
    </div>
  );
}

function DeviceCard({
  device,
  onEdit,
  onChanged,
  onRemoved,
}: {
  device: Device;
  onEdit: () => void;
  onChanged: (d: Device) => void;
  onRemoved: () => void;
}) {
  const [busy, setBusy] = useState<"test" | "fetch" | null>(null);
  const [result, setResult] = useState<DeviceTest | null>(null);

  async function onTest() {
    setBusy("test");
    try {
      const r = await testDevice(device.id);
      setResult(r);
      if (r.reachable) {
        toast.success(`${r.model ?? "Device"} answered · ${r.records} records`);
        onChanged({
          ...device,
          serial_number: r.serial_number,
          model: r.model,
          last_error: null,
        });
      } else {
        toast.error(r.message ?? "No answer");
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reach it");
    } finally {
      setBusy(null);
    }
  }

  async function onFetch(full: boolean) {
    setBusy("fetch");
    try {
      const r = await fetchDevice(device.id, full);
      toast.success(
        r.stored
          ? `${r.stored} punch${r.stored === 1 ? "" : "es"} added · ` +
              `${r.recomputed_days} day${r.recomputed_days === 1 ? "" : "s"} recalculated`
          : `Nothing new (${r.duplicates} already here)`,
      );
      if (r.unmatched.length) {
        toast.warning(`No employee for user ${r.unmatched.join(", ")}`);
      }
      onChanged({ ...device, last_sync_at: new Date().toISOString() });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Fetch failed");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!window.confirm(`Remove ${device.name}? Punches already taken stay.`)) {
      return;
    }
    try {
      await deleteDevice(device.id);
      onRemoved();
      toast.success("Device removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove");
    }
  }

  return (
    <li className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
            device.is_active
              ? "bg-primary/12 text-brand-ink"
              : "bg-muted text-muted-foreground",
          )}
        >
          <Fingerprint className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {device.name}
            {!device.is_active && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Off
              </span>
            )}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {device.host}:{device.port}
            {device.location ? ` · ${device.location}` : ""}
            {device.model ? ` · ${device.model}` : ""}
            {device.serial_number ? ` · SN ${device.serial_number}` : ""}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Last fetch {stamp(device.last_sync_at)} · newest punch taken{" "}
            {stamp(device.last_punch_at)}
          </p>
          {device.last_error && (
            <p className="mt-1 flex items-start gap-1.5 text-[11px] text-destructive">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              {device.last_error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy !== null}
            onClick={onTest}
          >
            {busy === "test" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plug className="size-3.5" />
            )}
            Test
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={busy !== null || !device.is_active}
            onClick={() => onFetch(false)}
          >
            {busy === "fetch" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Fetch
          </Button>
          <IconButton label="Edit device" icon={Save} size="sm" onClick={onEdit} />
          <IconButton
            label="Remove device"
            icon={Trash2}
            size="sm"
            variant="destructive"
            onClick={onDelete}
          />
        </div>
      </div>

      {result?.reachable && (
        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border/50 pt-3 sm:grid-cols-4">
          <Fact label="Firmware" value={result.firmware ?? "—"} />
          <Fact label="Enrolled" value={`${result.users} users`} />
          <Fact label="In its log" value={`${result.records} punches`} />
          <Fact
            label="Clock"
            value={
              result.clock_drift_minutes === null
                ? "—"
                : Math.abs(result.clock_drift_minutes) <= 2
                  ? "in step"
                  : `${result.clock_drift_minutes > 0 ? "+" : ""}${result.clock_drift_minutes} min`
            }
            tone={
              result.clock_drift_minutes !== null &&
              Math.abs(result.clock_drift_minutes) > 2
                ? "text-amber-700"
                : undefined
            }
          />
          {result.clock_drift_minutes !== null &&
            Math.abs(result.clock_drift_minutes) > 2 && (
              <p className="col-span-full text-[11px] text-amber-700">
                The terminal&rsquo;s clock is off by{" "}
                {Math.abs(result.clock_drift_minutes)} minutes. Punch times come
                from the terminal, so set it right before relying on them.
              </p>
            )}
          <div className="col-span-full">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              disabled={busy !== null}
              onClick={() => onFetch(true)}
            >
              <CheckCircle2 className="size-3" />
              Fetch everything on the device, not just what is new
            </Button>
          </div>
        </dl>
      )}
    </li>
  );
}

function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.04em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("text-xs font-semibold", tone)}>{value}</dd>
    </div>
  );
}

function DeviceForm({
  device,
  onCancel,
  onSaved,
}: {
  device: Device | null;
  onCancel: () => void;
  onSaved: (d: Device) => void;
}) {
  const [form, setForm] = useState<DevicePayload>(() =>
    device
      ? {
          name: device.name,
          host: device.host,
          port: device.port,
          password: device.password,
          timeout_seconds: device.timeout_seconds,
          force_udp: device.force_udp,
          omit_ping: device.omit_ping,
          location: device.location,
          clear_after_fetch: device.clear_after_fetch,
          is_active: device.is_active,
        }
      : emptyDevice(),
  );
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DevicePayload>(key: K, value: DevicePayload[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const saved = device
        ? await updateDevice(device.id, form)
        : await createDevice(form);
      toast.success(device ? "Device saved" : "Device added");
      onSaved(saved);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mb-5 space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => set("name", v)}
          placeholder="MB20ID — main gate"
        />
        <Field
          label="IP address"
          value={form.host}
          onChange={(v) => set("host", v)}
          placeholder="192.168.1.201"
        />
        <Field
          label="Port"
          type="number"
          value={String(form.port)}
          onChange={(v) => set("port", Number(v))}
          hint="4370 unless changed"
        />
        <Field
          label="Comms password"
          type="number"
          value={String(form.password)}
          onChange={(v) => set("password", Number(v))}
          hint="0 when none is set"
        />
        <Field
          label="Location"
          value={form.location ?? ""}
          onChange={(v) => set("location", v || null)}
          placeholder="Reception"
        />
        <Field
          label="Timeout (seconds)"
          type="number"
          value={String(form.timeout_seconds)}
          onChange={(v) => set("timeout_seconds", Number(v))}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle
          label="Device is in use"
          hint="Turn off to stop fetching from it without losing the settings."
          checked={form.is_active}
          onChange={(v) => set("is_active", v)}
        />
        <Toggle
          label="Clear the device after a fetch"
          hint="Keeps a small terminal log from filling up. The punches then exist only here."
          checked={form.clear_after_fetch}
          onChange={(v) => set("clear_after_fetch", v)}
        />
        <Toggle
          label="Use UDP"
          hint="Only for older firmware that will not hold a TCP connection."
          checked={form.force_udp}
          onChange={(v) => set("force_udp", v)}
        />
        <Toggle
          label="Skip the ping check"
          hint="Leave on. Many terminals do not answer ping but talk happily on 4370."
          checked={form.omit_ping}
          onChange={(v) => set("omit_ping", v)}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={onCancel}
          disabled={saving}
        >
          <X className="size-3.5" />
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          className="h-8 text-xs"
          disabled={saving || !form.name.trim() || !form.host.trim()}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          {device ? "Save device" : "Add device"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-sm"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="block text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </span>
      </span>
    </label>
  );
}
