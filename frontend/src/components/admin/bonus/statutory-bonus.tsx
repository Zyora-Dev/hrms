"use client";

import { useEffect, useState } from "react";
import { Award, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ApiError,
  applyBonus,
  previewBonus,
  type BonusPreview,
} from "@/lib/loans";
import { rupees } from "@/lib/payroll";
import { currentFy, fyLabel } from "@/lib/tds";
import { cn } from "@/lib/utils";

const TH = "h-9 px-2 text-[11px] font-semibold uppercase tracking-[0.04em]";
const TD = "px-2 py-1.5 text-xs";
const NUM = `${TD} text-right tabular-nums`;

export function StatutoryBonus() {
  const [fy, setFy] = useState(() => currentFy());
  const [rate, setRate] = useState("");
  const [period, setPeriod] = useState("");
  const [data, setData] = useState<BonusPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let alive = true;
    previewBonus({ financial_year: fy, rate: rate || undefined })
      .then((d) => alive && setData(d))
      .catch((err) => {
        if (!alive) return;
        toast.error(err instanceof ApiError ? err.message : "Could not compute");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fy, rate]);

  async function onApply() {
    if (!period) {
      toast.error("Choose the month to pay it in");
      return;
    }
    setApplying(true);
    try {
      const created = await applyBonus({
        financial_year: fy,
        period: `${period}-01`,
        rate: rate || undefined,
      });
      toast.success(
        `Added to ${period} for ${created.length} employee(s) — recalculate that run to apply`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not apply");
    } finally {
      setApplying(false);
    }
  }

  const years = [currentFy(), currentFy() - 1, currentFy() - 2];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold">Accounting year</Label>
          <Select
            value={String(fy)}
            onValueChange={(v) => {
              setFy(Number(v));
              setLoading(true);
            }}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  FY {fyLabel(y)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold">Rate %</Label>
          <Input
            type="number"
            step="0.01"
            placeholder={data?.rate ?? "8.33"}
            value={rate}
            onChange={(e) => {
              setRate(e.target.value);
              setLoading(true);
            }}
            className="h-8 w-[110px] text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold">Pay in month</Label>
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-8 w-[150px] text-xs"
          />
        </div>

        <Button
          size="sm"
          className="h-8"
          onClick={onApply}
          disabled={applying || !data || data.eligible_count === 0}
        >
          {applying ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          Add to payroll
        </Button>
      </div>

      {data && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-4 py-2.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="text-[10px]">
            {data.basis === "basic_da"
              ? "Basic + DA"
              : data.basis === "basic"
                ? "Basic"
                : "Gross"}
          </Badge>
          <span>
            Eligible up to{" "}
            <span className="font-semibold text-foreground">
              {rupees(data.eligibility_ceiling, 0)}
            </span>{" "}
            a month
          </span>
          <span>·</span>
          <span>
            Computed on wage capped at{" "}
            <span className="font-semibold text-foreground">
              {rupees(data.calculation_ceiling, 0)}
            </span>
          </span>
          <span>·</span>
          <span>
            Rate{" "}
            <span className="font-semibold text-foreground">{data.rate}%</span>
          </span>
          <span className="ml-auto font-semibold text-foreground">
            {data.eligible_count} eligible · {rupees(data.total)}
          </span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} pl-4`}>Employee</TableHead>
                <TableHead className={`${TH} text-right`}>Months</TableHead>
                <TableHead className={`${TH} text-right`}>Days</TableHead>
                <TableHead className={`${TH} hidden text-right sm:table-cell`}>
                  Wage
                </TableHead>
                <TableHead className={`${TH} text-right`}>
                  Capped wage
                </TableHead>
                <TableHead className={`${TH} text-right`}>Bonus</TableHead>
                <TableHead className={`${TH} pr-4`}>Eligibility</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7} className="pl-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!loading && data?.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Award className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">No payroll this year</p>
                      <p className="text-xs text-muted-foreground">
                        Bonus accrues from processed payslips.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                data?.rows.map((r) => {
                  const paid = r.eligible && Number(r.amount) > 0;
                  return (
                    <TableRow key={r.employee_id} className={cn(!paid && "opacity-70")}>
                      <TableCell className={`${TD} pl-4`}>
                        <span className="flex items-baseline gap-2">
                          <span className="truncate font-semibold">
                            {r.employee_name}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                            {r.employee_code}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className={NUM}>{r.months}</TableCell>
                      <TableCell className={NUM}>{r.days_worked}</TableCell>
                      <TableCell className={`${NUM} hidden sm:table-cell`}>
                        {rupees(r.wage_total, 0)}
                      </TableCell>
                      <TableCell className={NUM}>
                        {rupees(r.capped_wage_total, 0)}
                      </TableCell>
                      <TableCell className={`${NUM} font-semibold`}>
                        {paid ? rupees(r.amount, 0) : "—"}
                      </TableCell>
                      <TableCell className={`${TD} pr-4`}>
                        {paid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                            <CheckCircle2 className="size-3" />
                            Eligible
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            {r.reason ?? "Not eligible"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
