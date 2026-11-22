import type { Metadata } from "next";

import { DocumentLibrary } from "@/components/admin/documents/document-library";

export const metadata: Metadata = { title: "Documents · HRMS" };

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-foreground/80">
          Every employee&rsquo;s file in one place — open a folder to see what
          is on record, or filter to whoever is still missing something.
        </p>
      </div>

      <DocumentLibrary />
    </div>
  );
}
