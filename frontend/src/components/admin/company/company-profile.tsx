"use client";

import { useEffect, useState } from "react";
import { Building2, Pencil, X } from "lucide-react";

import { IconButton } from "@/components/admin/icon-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, companyTypeLabel, getCompany, type Company } from "@/lib/company";
import { CompanyForm } from "./company-form";
import { CompanyView } from "./company-view";
import { LogoUploader } from "./logo-uploader";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; company: Company };

export function CompanyProfile() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let active = true;
    getCompany()
      .then((company) => {
        if (!active) return;
        setState(company ? { status: "ready", company } : { status: "empty" });
      })
      .catch((err) => {
        if (!active) return;
        setState({
          status: "error",
          message: err instanceof ApiError ? err.message : "Could not load company",
        });
      });
    return () => {
      active = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">
        {state.message}
      </div>
    );
  }

  // No profile yet — go straight to the create form.
  if (state.status === "empty") {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-4 rounded-xl border border-border/60 bg-card p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-inset ring-primary/20">
            <Building2 className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">No company profile yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fill in the details below to create it. You can upload a logo once
              the company is saved.
            </p>
          </div>
        </div>

        <CompanyForm
          company={null}
          onSaved={(company) => setState({ status: "ready", company })}
        />
      </div>
    );
  }

  const { company } = state;

  function setCompany(next: Company) {
    setState({ status: "ready", company: next });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-5 rounded-xl border border-border/60 bg-card p-5 sm:p-6">
        <LogoUploader company={company} onChange={setCompany} />

        <div className="flex h-9 items-center gap-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="secondary" className="font-mono font-semibold">
              {company.company_uid}
            </Badge>
            <Badge variant="outline" className="font-medium">
              {companyTypeLabel(company.company_type)}
            </Badge>
            {company.is_active ? (
              <Badge className="bg-primary/15 font-medium text-primary hover:bg-primary/15">
                Active
              </Badge>
            ) : (
              <Badge variant="outline">Inactive</Badge>
            )}
          </div>

          <IconButton
            label={editing ? "Cancel editing" : "Edit details"}
            icon={editing ? X : Pencil}
            variant={editing ? "neutral" : "brand"}
            onClick={() => setEditing((v) => !v)}
          />
        </div>
      </div>

      {editing ? (
        <CompanyForm
          company={company}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setCompany(next);
            setEditing(false);
          }}
        />
      ) : (
        <CompanyView company={company} />
      )}
    </div>
  );
}
