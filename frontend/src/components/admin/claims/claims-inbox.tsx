"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Paperclip, Receipt, Search, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { API_URL } from "@/lib/auth";
import {
  ApiError,
  decideClaim,
  getClaim,
  listClaims,
  payClaim,
  type Claim,
} from "@/lib/claims";
import { monthLabel, rupees } from "@/lib/payroll";
import { useBadges } from "@/components/admin/shell/badges";
import { useLiveEvents } from "@/lib/live";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-800",
  approved: "bg-emerald-500/15 text-emerald-800",
  rejected: "bg-destructive/15 text-destructive",
  paid: "bg-primary/15 text-primary",
  cancelled: "bg-muted text-foreground/70",
};

const TH = "px-2 py-2 text-xs font-bold";
const TD = "px-2 py-2 text-xs";

export function ClaimsInbox() {
  const { refresh } = useBadges();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set by a notification: open straight onto that one claim.
  const focused = Number(searchParams.get("claim")) || null;

  const [status, setStatus] = useState("pending");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Claim[] | null>(null);
  const [deciding, setDeciding] = useState<Claim | null>(null);
  const [paying, setPaying] = useState<Claim | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    listClaims({ status, q: query.trim() || undefined })
      .then((r) => alive && setRows(r))
      .catch(() => alive && setRows([]));
    return () => {
      alive = false;
    };
  }, [status, query, reloadKey]);

  const reload = () => {
    setReloadKey((k) => k + 1);
    refresh();
  };

  // A claim raised while the admin is on this screen should just appear.
  useLiveEvents("admin", (event) => {
    if (event.kind === "reimbursement_claim") setReloadKey((k) => k + 1);
  });

  function clearFocus() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("claim");
    const query = next.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }

  // Fetched on its own: the claim a notification points at may sit behind
  // the status filter currently selected.
  useEffect(() => {
    if (!focused) return;
    let alive = true;
    getClaim(focused)
      .then((c) => alive && setDeciding(c))
      .catch(() => {
        if (alive) toast.error("That claim no longer exists");
      });
    return () => {
      alive = false;
    };
  }, [focused]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Employee or reference"
            className="h-8 pl-8 text-xs"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border/60">
              <tr>
                <th className={`${TH} pl-4 text-left`}>Employee</th>
                <th className={`${TH} text-left`}>Claim</th>
                <th className={`${TH} text-left`}>Spent</th>
                <th className={`${TH} text-right`}>Amount</th>
                <th className={`${TH} text-left`}>Status</th>
                <th className={`${TH} pr-4 text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows === null &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-2">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))}

              {rows?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-14">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground/60">
                        <Receipt className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">Nothing here</p>
                      <p className="text-xs text-foreground/70">
                        Claims raised by employees land in this list.
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {rows?.map((claim) => (
                <tr key={claim.id}>
                  <td className={`${TD} pl-4`}>
                    <span className="block font-semibold">
                      {claim.employee_name}
                    </span>
                    <span className="block font-mono text-[10px] text-foreground/70">
                      {claim.employee_code}
                    </span>
                  </td>
                  <td className={TD}>
                    <span className="flex items-center gap-1.5 font-semibold">
                      {claim.title}
                      {claim.receipt_path && (
                        <a
                          href={`${API_URL}${claim.receipt_path}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="View receipt"
                          className="text-foreground/60 hover:text-foreground"
                        >
                          <Paperclip className="size-3" />
                        </a>
                      )}
                    </span>
                    <span className="block text-[10px] capitalize text-foreground/70">
                      {claim.reference} · {claim.category}
                      {claim.paid_period &&
                        ` · paid with ${monthLabel(claim.paid_period)}`}
                    </span>
                  </td>
                  <td className={TD}>{claim.spent_on}</td>
                  <td className={`${TD} text-right tabular-nums`}>
                    <span className="font-semibold">
                      {rupees(claim.approved_amount ?? claim.amount, 0)}
                    </span>
                    {claim.approved_amount &&
                      claim.approved_amount !== claim.amount && (
                        <span className="block text-[10px] text-foreground/60 line-through">
                          {rupees(claim.amount, 0)}
                        </span>
                      )}
                  </td>
                  <td className={TD}>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                        TONES[claim.status],
                      )}
                    >
                      {claim.status}
                    </span>
                  </td>
                  <td className={`${TD} pr-4 text-right`}>
                    {claim.status === "pending" && (
                      <Button
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => setDeciding(claim)}
                      >
                        Review
                      </Button>
                    )}
                    {claim.status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => setPaying(claim)}
                      >
                        <Wallet className="size-3" />
                        Settle
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {deciding && (
        <DecideDialog
          claim={deciding}
          onClose={() => {
            setDeciding(null);
            if (focused) clearFocus();
          }}
          onDone={() => {
            setDeciding(null);
            if (focused) clearFocus();
            reload();
          }}
        />
      )}

      {paying && (
        <PayDialog
          claim={paying}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function DecideDialog({
  claim,
  onClose,
  onDone,
}: {
  claim: Claim;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(claim.amount);
  const [settlement, setSettlement] = useState<"payroll" | "separate">(
    "payroll",
  );
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(status: "approved" | "rejected") {
    setBusy(true);
    try {
      await decideClaim(claim.id, {
        status,
        approved_amount: status === "approved" ? amount : null,
        settlement,
        note: note.trim() || null,
      });
      toast.success(status === "approved" ? "Claim approved" : "Claim rejected");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{claim.title}</DialogTitle>
          <DialogDescription>
            {claim.employee_name} · {claim.reference} · spent {claim.spent_on}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {claim.description && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              {claim.description}
            </p>
          )}

          {claim.receipt_path && (
            <a
              href={`${API_URL}${claim.receipt_path}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink hover:underline"
            >
              <Paperclip className="size-3.5" />
              Open the receipt
            </a>
          )}

          {claim.status !== "pending" && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              <span className="font-semibold capitalize">{claim.status}</span>
              {claim.decided_by ? ` by ${claim.decided_by}` : ""}
              {claim.decision_note ? ` — ${claim.decision_note}` : ""}
            </p>
          )}

          <div
            className={cn(
              "grid gap-4 sm:grid-cols-2",
              claim.status !== "pending" && "hidden",
            )}
          >
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Approve how much? (claimed {rupees(claim.amount, 0)})
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={claim.amount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Settle</Label>
              <Select
                value={settlement}
                onValueChange={(v) => setSettlement(v as typeof settlement)}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="payroll">Through payroll</SelectItem>
                  <SelectItem value="separate">Separately</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            className={cn(
              "space-y-1.5",
              claim.status !== "pending" && "hidden",
            )}
          >
            <Label className="text-xs font-semibold">Note to the employee</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Tolls are not covered"
              className="h-9"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {claim.status === "pending" && (
            <>
              <Button
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => decide("rejected")}
              >
                <X className="size-4" />
                Reject
              </Button>
              <Button
                disabled={busy || Number(amount) <= 0}
                onClick={() => decide("approved")}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({
  claim,
  onClose,
  onDone,
}: {
  claim: Claim;
  onClose: () => void;
  onDone: () => void;
}) {
  const [period, setPeriod] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await payClaim(claim.id, `${period}-01`);
      toast.success(
        claim.settlement === "payroll"
          ? "Added to that month's pay run"
          : "Marked as settled",
      );
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not settle");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settle {claim.reference}</DialogTitle>
          <DialogDescription>
            {rupees(claim.approved_amount ?? claim.amount, 0)} to{" "}
            {claim.employee_name}
            {claim.settlement === "payroll"
              ? " — this adds a one-off earning to the month you pick."
              : " — this only records that it was paid outside payroll."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Month</Label>
          <Input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="h-9"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={busy || !period} onClick={submit}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wallet className="size-4" />
            )}
            Settle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
