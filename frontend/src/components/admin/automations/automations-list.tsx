"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
  Loader2,
  Play,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  describeSchedule,
  listAutomations,
  runAutomation,
  saveAutomation,
  type Automation,
  type Cadence,
} from "@/lib/automations";
import { cn } from "@/lib/utils";

function stamp(iso: string | null) {
  if (!iso) return "never";
  return iso.slice(0, 16).replace("T", " ");
}

export function AutomationsList() {
  const [rows, setRows] = useState<Automation[] | null>(null);

  useEffect(() => {
    listAutomations()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  function replace(saved: Automation) {
    setRows((list) =>
      (list ?? []).map((row) => (row.key === saved.key ? saved : row)),
    );
  }

  if (!rows) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const on = rows.filter((r) => r.is_enabled).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card px-4 py-3">
        <Workflow className="size-4 text-brand-ink" />
        <p className="text-xs">
          <span className="font-bold">{on}</span> of {rows.length} running.
          The server checks every half minute, so a job starts within a minute
          of its time.
        </p>
      </div>

      <ul className="space-y-3">
        {rows.map((row) => (
          <AutomationCard key={row.key} row={row} onChanged={replace} />
        ))}
      </ul>
    </div>
  );
}

function AutomationCard({
  row,
  onChanged,
}: {
  row: Automation;
  onChanged: (saved: Automation) => void;
}) {
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [cadence, setCadence] = useState<Cadence>(row.cadence);
  const [minutes, setMinutes] = useState(String(row.every_minutes));
  const [at, setAt] = useState(row.run_at.slice(0, 5));
  const [day, setDay] = useState(String(row.day_of_month));

  async function save(body: Parameters<typeof saveAutomation>[1], done: string) {
    setBusy("save");
    try {
      onChanged(await saveAutomation(row.key, body));
      toast.success(done);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy("run");
    try {
      const saved = await runAutomation(row.key);
      onChanged(saved);
      (saved.last_status === "ok" ? toast.success : toast.error)(
        saved.last_message ?? "Done",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "It did not run");
    } finally {
      setBusy(null);
    }
  }

  const failed = row.last_status === "failed";

  return (
    <li className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
            row.is_enabled
              ? "bg-emerald-500/12 text-emerald-700"
              : "bg-muted text-foreground/60",
          )}
        >
          <Workflow className="size-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{row.name}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/75">
            {row.description}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="flex items-center gap-1.5 font-semibold">
              <Clock className="size-3" />
              {describeSchedule(row)}
            </span>
            {row.is_enabled && row.next_run_at && (
              <span className="text-foreground/70">
                next {stamp(row.next_run_at)}
              </span>
            )}
            {row.last_run_at && (
              <span
                className={cn(
                  "flex items-center gap-1.5",
                  failed ? "text-destructive" : "text-foreground/70",
                )}
              >
                {failed ? (
                  <AlertCircle className="size-3" />
                ) : (
                  <CheckCircle2 className="size-3" />
                )}
                last ran {stamp(row.last_run_at)}
              </span>
            )}
          </div>

          {row.last_message && (
            <p
              className={cn(
                "mt-1.5 rounded-lg px-2.5 py-1.5 text-[11px]",
                failed
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted/60 text-foreground/80",
              )}
            >
              {row.last_message}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={row.is_enabled}
            disabled={busy !== null}
            aria-label={`Turn ${row.name} ${row.is_enabled ? "off" : "on"}`}
            onCheckedChange={(v) =>
              save({ is_enabled: v }, v ? "Switched on" : "Switched off")
            }
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={busy !== null}
            onClick={run}
          >
            {busy === "run" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Run now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? "Close" : "Schedule"}
          </Button>
        </div>
      </div>

      {editing && (
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border/50 pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">How often</Label>
            <Select
              value={cadence}
              onValueChange={(v) => setCadence(v as Cadence)}
            >
              <SelectTrigger className="h-9 w-[170px] text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="every_minutes">Every few minutes</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cadence === "every_minutes" ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Minutes apart</Label>
              <Input
                type="number"
                min={1}
                max={1440}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="h-9 w-28 text-sm"
              />
            </div>
          ) : (
            <>
              {cadence === "monthly" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Day of month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    className="h-9 w-24 text-sm"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">At</Label>
                <Input
                  type="time"
                  value={at}
                  onChange={(e) => setAt(e.target.value)}
                  className="h-9 w-32 text-sm"
                />
              </div>
            </>
          )}

          <Button
            className="h-9"
            disabled={busy !== null}
            onClick={() =>
              save(
                {
                  cadence,
                  every_minutes: Number(minutes) || 15,
                  run_at: `${at}:00`,
                  day_of_month: Number(day) || 1,
                },
                "Schedule saved",
              )
            }
          >
            {busy === "save" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Clock className="size-4" />
            )}
            Save schedule
          </Button>

          <Button
            variant="ghost"
            className="h-9 text-xs"
            onClick={() => setShowHistory((v) => !v)}
          >
            <History className="size-3.5" />
            {showHistory ? "Hide" : "Recent runs"}
          </Button>
        </div>
      )}

      {editing && showHistory && (
        <ul className="mt-3 space-y-1 border-t border-border/50 pt-3">
          {row.recent.length === 0 && (
            <li className="text-[11px] text-foreground/70">
              It has not run yet.
            </li>
          )}
          {row.recent.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-baseline gap-x-3 text-[11px]"
            >
              <span className="font-mono">{stamp(entry.started_at)}</span>
              <span
                className={cn(
                  "font-semibold capitalize",
                  entry.status === "failed"
                    ? "text-destructive"
                    : entry.status === "skipped"
                      ? "text-foreground/60"
                      : "text-emerald-700",
                )}
              >
                {entry.status}
              </span>
              <span className="text-foreground/75">{entry.message}</span>
              {entry.triggered_by !== "schedule" && (
                <span className="text-foreground/60">· by hand</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
