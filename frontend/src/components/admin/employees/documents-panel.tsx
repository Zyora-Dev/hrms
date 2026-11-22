"use client";

import { useRef, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ApiError,
  DOC_TYPES,
  deleteDocument,
  formatDate,
  labelOf,
  uploadDocument,
  type DocType,
  type Employee,
  type EmployeeDocument,
} from "./shared";

const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf";
const MAX_BYTES = 5 * 1024 * 1024;

export function DocumentsPanel({
  employee,
  onChange,
}: {
  employee: Employee;
  onChange: (docs: EmployeeDocument[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState<DocType>("id_proof");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Document must be a PDF, PNG, JPEG or WebP file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Document must be 5 MB or smaller");
      return;
    }

    setBusy(true);
    try {
      const doc = await uploadDocument(employee.id, docType, file, title.trim());
      onChange([...employee.documents, doc]);
      setTitle("");
      toast.success(`${labelOf(DOC_TYPES, docType)} uploaded`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(doc: EmployeeDocument) {
    if (!window.confirm("Delete this document? This cannot be undone.")) return;
    setRemoving(doc.id);
    try {
      await deleteDocument(employee.id, doc.id);
      onChange(employee.documents.filter((d) => d.id !== doc.id));
      toast.success("Document deleted");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not delete document");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 sm:p-6">
      <header className="mb-5">
        <h2 className="text-sm font-semibold text-foreground">Documents</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          ID proof, degree certificates and other records. PDF or image, up to 5 MB.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
        <div className="min-w-[180px] flex-1 space-y-2">
          <Label className="text-xs font-semibold">Document type</Label>
          <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOC_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-[180px] flex-1 space-y-2">
          <Label className="text-xs font-semibold">Title (optional)</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="B.Tech degree certificate"
          />
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onPick}
          className="hidden"
        />
        <div className="flex h-9 items-center">
          <IconButton
            label="Upload document"
            icon={busy ? Loader2 : Upload}
            variant="brand"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={busy ? "[&_svg]:animate-spin" : undefined}
          />
        </div>
      </div>

      {employee.documents.length === 0 ? (
        <div className="mt-5 flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Paperclip className="size-4" />
          </span>
          <p className="text-sm font-semibold">No documents yet</p>
          <p className="text-sm text-muted-foreground">
            Upload an ID proof or degree certificate above.
          </p>
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border/60">
          {employee.documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-brand-ink">
                <FileText className="size-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  {doc.title || labelOf(DOC_TYPES, doc.doc_type)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {labelOf(DOC_TYPES, doc.doc_type)}
                  {doc.original_name ? ` · ${doc.original_name}` : ""}
                  {` · ${formatDate(doc.uploaded_at)}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {doc.file_url && (
                  <IconButton
                    label="Open document"
                    icon={Download}
                    variant="neutral"
                    onClick={() => window.open(doc.file_url!, "_blank", "noopener")}
                  />
                )}
                <IconButton
                  label="Delete document"
                  icon={Trash2}
                  variant="destructive"
                  disabled={removing === doc.id}
                  onClick={() => onDelete(doc)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
