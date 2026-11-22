"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  Search,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  employeeDocuments,
  kindLabel,
  loadLibrary,
  recentDocuments,
  type Library,
  type LibraryDocument,
  type LibraryFolder,
} from "@/lib/documents";
import { listLookups, type Lookup } from "@/lib/lookups";
import { cn } from "@/lib/utils";

const KINDS = [
  "id_proof",
  "address_proof",
  "pan_card",
  "degree_certificate",
  "experience_letter",
  "letter",
  "other",
];

export function DocumentLibrary() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [kind, setKind] = useState("all");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [library, setLibrary] = useState<Library | null>(null);
  const [recent, setRecent] = useState<LibraryDocument[]>([]);
  const [open, setOpen] = useState<LibraryFolder | null>(null);

  useEffect(() => {
    listLookups("departments")
      .then(setDepartments)
      .catch(() => setDepartments([]));
    recentDocuments()
      .then(setRecent)
      .catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let alive = true;
    loadLibrary({
      q: search || undefined,
      department_id: department,
      doc_type: kind,
      only_missing: onlyMissing,
    })
      .then((l) => alive && setLibrary(l))
      .catch((err) => {
        if (alive) {
          toast.error(err instanceof ApiError ? err.message : "Could not load");
          setLibrary(null);
        }
      });
    return () => {
      alive = false;
    };
  }, [search, department, kind, onlyMissing]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label="Files on record"
          value={String(library?.total_documents ?? "—")}
        />
        <Tile
          label="Employee folders"
          value={String(library?.total_employees ?? "—")}
        />
        <Tile
          label="Missing something"
          value={String(library?.missing.length ?? "—")}
          tone={library?.missing.length ? "warn" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-foreground/50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Employee or code"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={String(d.id)}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any document</SelectItem>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {kindLabel(k)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          variant={onlyMissing ? "default" : "outline"}
          className="h-8 text-xs"
          onClick={() => setOnlyMissing((v) => !v)}
        >
          <TriangleAlert className="size-3.5" />
          Incomplete only
        </Button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="overflow-hidden rounded-xl border border-border/60 bg-card">
          {!library ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : library.folders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground/60">
                <FolderOpen className="size-4" />
              </span>
              <p className="text-sm font-semibold">Nothing to show</p>
              <p className="text-xs text-foreground/75">
                No employee matches these filters.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {library.folders.map((folder) => (
                <li key={folder.employee_id}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpen(
                        open?.employee_id === folder.employee_id ? null : folder,
                      )
                    }
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        folder.documents
                          ? "bg-primary/12 text-brand-ink"
                          : "bg-muted text-foreground/60",
                      )}
                    >
                      <FolderOpen className="size-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold">
                        {folder.employee_name}
                        <span className="ml-2 font-mono text-[10px] font-medium text-foreground/70">
                          {folder.employee_code}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-foreground/70">
                        {[folder.designation, folder.department]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="block text-xs font-bold">
                        {folder.documents}
                      </span>
                      <span className="block text-[10px] text-foreground/70">
                        file{folder.documents === 1 ? "" : "s"}
                      </span>
                    </span>

                    <ChevronRight
                      className={cn(
                        "size-4 shrink-0 text-foreground/50 transition-transform",
                        open?.employee_id === folder.employee_id && "rotate-90",
                      )}
                    />
                  </button>

                  {open?.employee_id === folder.employee_id && (
                    <FolderContents folder={folder} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border/60 bg-card p-4">
          <h2 className="text-sm font-bold">Recently added</h2>
          <ul className="mt-3 space-y-2.5">
            {recent.length === 0 && (
              <li className="text-xs text-foreground/75">Nothing yet.</li>
            )}
            {recent.slice(0, 8).map((doc) => (
              <li key={doc.id} className="flex items-center gap-2.5">
                <FileText className="size-3.5 shrink-0 text-foreground/60" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold">
                    {doc.title || doc.original_name || kindLabel(doc.doc_type)}
                  </span>
                  <span className="block truncate text-[10px] text-foreground/70">
                    {doc.employee_code} · {doc.uploaded_at.slice(0, 10)}
                  </span>
                </span>
                <a
                  href={doc.file_url ?? `${API_URL}${doc.file_path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-foreground/60 hover:text-foreground"
                  aria-label="Open"
                >
                  <Download className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function FolderContents({ folder }: { folder: LibraryFolder }) {
  const [docs, setDocs] = useState<LibraryDocument[] | null>(null);

  useEffect(() => {
    let alive = true;
    employeeDocuments(folder.employee_id)
      .then((d) => alive && setDocs(d))
      .catch(() => alive && setDocs([]));
    return () => {
      alive = false;
    };
  }, [folder.employee_id]);

  return (
    <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
      {!docs ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : docs.length === 0 ? (
        <p className="text-[11px] text-foreground/75">
          Nothing on file for {folder.employee_name}.{" "}
          <Link
            href={`/admin/employees/${folder.employee_id}?tab=documents`}
            className="font-semibold text-brand-ink hover:underline"
          >
            Upload something
          </Link>
          .
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2.5">
                <FileText className="size-3.5 shrink-0 text-brand-ink" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold">
                    {doc.title || doc.original_name}
                  </span>
                  <span className="block text-[10px] text-foreground/70">
                    {kindLabel(doc.doc_type)} · {doc.uploaded_at.slice(0, 10)}
                  </span>
                </span>
                <a
                  href={doc.file_url ?? `${API_URL}${doc.file_path}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button size="sm" variant="outline" className="h-7 text-[11px]">
                    <Download className="size-3" />
                    Open
                  </Button>
                </a>
              </li>
            ))}
          </ul>
          <Link
            href={`/admin/employees/${folder.employee_id}?tab=documents`}
            className="mt-3 inline-block text-[11px] font-semibold text-brand-ink hover:underline"
          >
            Manage this employee&rsquo;s files →
          </Link>
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3",
        tone === "warn" ? "border-amber-500/40" : "border-border/60",
      )}
    >
      <p className="text-[11px] font-semibold text-foreground/70">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-2xl font-bold tracking-tight",
          tone === "warn" && "text-amber-700",
        )}
      >
        {value}
      </p>
    </div>
  );
}
