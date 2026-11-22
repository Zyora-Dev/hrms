"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  FileSignature,
  Loader2,
  Sparkles,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  generateLetter,
  listTemplates,
  previewLetter,
  type LetterPreview,
  type LetterTemplate,
} from "@/lib/letters";
import type { Employee, EmployeeDocument } from "./shared";
import { cn } from "@/lib/utils";

/** Human label for a merge field that the employee record is missing. */
const FIELD_LABELS: Record<string, string> = {
  designation: "Designation",
  department: "Department",
  date_of_joining: "Date of joining",
  probation_end_date: "Probation end date",
  date_of_exit: "Date of exit",
  ctc_annual: "Annual CTC",
  work_location: "Work location",
  pan: "PAN",
};

export function LettersPanel({
  employee,
  onGenerated,
}: {
  employee: Employee;
  onGenerated: (doc: EmployeeDocument) => void;
}) {
  const [templates, setTemplates] = useState<LetterTemplate[] | null>(null);
  const [active, setActive] = useState<LetterTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<LetterPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let alive = true;
    listTemplates()
      .then((rows) => alive && setTemplates(rows))
      .catch(() => alive && setTemplates([]));
    return () => {
      alive = false;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, LetterTemplate[]>();
    for (const t of templates ?? []) {
      map.set(t.category, [...(map.get(t.category) ?? []), t]);
    }
    return [...map.entries()];
  }, [templates]);

  /** Required employee fields this letter needs but the record lacks. */
  function missingFor(template: LetterTemplate): string[] {
    const record = employee as unknown as Record<string, unknown>;
    return template.required_fields.filter((f) => {
      const v = record[f];
      return v === null || v === undefined || v === "";
    });
  }

  function openTemplate(template: LetterTemplate) {
    setActive(template);
    setPreview(null);
    setValues(
      Object.fromEntries(template.inputs.map((i) => [i.name, ""])),
    );
  }

  async function onPreview() {
    if (!active) return;
    setPreviewing(true);
    try {
      setPreview(await previewLetter(employee.id, active.id, values));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not preview");
    } finally {
      setPreviewing(false);
    }
  }

  async function onGenerate() {
    if (!active) return;
    setGenerating(true);
    try {
      const doc = await generateLetter(employee.id, active.id, values);
      onGenerated(doc);
      toast.success(`${active.name} generated and filed`);
      setActive(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not generate");
    } finally {
      setGenerating(false);
    }
  }

  const blocked = active ? missingFor(active) : [];

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5">
        <h2 className="text-sm font-semibold text-foreground">Generate letter</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Letters are filled from this employee&apos;s record and your company
          profile, then filed under Documents as a PDF.
        </p>
      </header>

      {templates === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No letter templates yet. Add them in Settings.
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([category, items]) => (
            <div key={category}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {category}
              </p>
              <div className="flex flex-wrap gap-2">
                {items.map((template) => {
                  const missing = missingFor(template);
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => openTemplate(template)}
                      title={
                        missing.length
                          ? `Needs: ${missing.map((m) => FIELD_LABELS[m] ?? m).join(", ")}`
                          : undefined
                      }
                      className={cn(
                        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        missing.length
                          ? "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                          : "border-primary/25 bg-primary/10 text-brand-ink hover:bg-primary/15",
                      )}
                    >
                      <FileSignature className="size-4" />
                      {template.name}
                      {missing.length > 0 && (
                        <AlertTriangle className="size-3.5 text-amber-600" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!active}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        <DialogContent className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="border-b border-border/60 p-5">
            <DialogTitle>{active?.name}</DialogTitle>
            <DialogDescription>
              For {employee.full_name} · {employee.employee_code}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-5 overflow-y-auto p-5">
            {blocked.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-800">
                <AlertTriangle className="mt-px size-4 shrink-0" />
                <span>
                  This letter needs{" "}
                  <b>
                    {blocked.map((f) => FIELD_LABELS[f] ?? f).join(", ")}
                  </b>{" "}
                  on the employee record. Add it from Edit employee first.
                </span>
              </div>
            )}

            {active?.inputs.map((field) => (
              <div key={field.name} className="space-y-2">
                <Label className="text-sm font-semibold">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
                {field.type === "textarea" ? (
                  <Textarea
                    rows={3}
                    value={values[field.name] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.name]: e.target.value }))
                    }
                  />
                ) : (
                  <Input
                    type={field.type === "date" ? "date" : "text"}
                    value={values[field.name] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.name]: e.target.value }))
                    }
                  />
                )}
              </div>
            ))}

            {preview && (
              <div className="rounded-lg border border-border bg-muted/30 p-2">
                <p className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
                  Preview
                </p>
                <iframe
                  title="Letter preview"
                  srcDoc={preview.html}
                  className="h-[420px] w-full rounded border border-border bg-white"
                />
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 p-5">
            <Button
              type="button"
              variant="outline"
              onClick={onPreview}
              disabled={previewing || generating}
            >
              {previewing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              Preview
            </Button>
            <Button
              type="button"
              onClick={onGenerate}
              disabled={generating || blocked.length > 0}
            >
              {generating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
