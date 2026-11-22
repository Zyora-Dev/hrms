"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import { ApiError, deleteLogo, uploadLogo, type Company } from "@/lib/company";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

export function LogoUploader({
  company,
  onChange,
  disabled,
}: {
  company: Company;
  onChange: (c: Company) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Revoke the object URL when it is replaced or the component unmounts.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;

    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Logo must be a PNG, JPEG, WebP or SVG image");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo must be 2 MB or smaller");
      return;
    }

    // Show the local preview immediately, then upload.
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      const updated = await uploadLogo(file);
      onChange(updated);
      toast.success("Logo updated");
    } catch (err) {
      setPreview(null);
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    try {
      const updated = await deleteLogo();
      setPreview(null);
      onChange(updated);
      toast.success("Logo removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove logo");
    } finally {
      setBusy(false);
    }
  }

  const src = preview ?? company.logo_url;

  return (
    <div className="flex items-center gap-5">
      <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/40">
        {src ? (
          // Logos come from the API origin at arbitrary sizes; plain <img>
          // avoids configuring next/image remote patterns for one asset.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`${company.name} logo`}
            className="size-full object-contain p-2"
          />
        ) : (
          <span className="text-center text-[11px] leading-tight text-muted-foreground">
            No logo
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </span>
        )}
      </div>

      <div className="min-w-0">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onPick}
          className="hidden"
        />
        <p className="text-sm font-semibold">Company logo</p>
        <div className="mt-2 flex h-9 items-center gap-2">
          <IconButton
            label={src ? "Replace logo" : "Upload logo"}
            icon={ImageUp}
            variant="brand"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          />
          {company.logo_url && (
            <IconButton
              label="Delete logo"
              icon={Trash2}
              variant="destructive"
              disabled={disabled || busy}
              onClick={onRemove}
            />
          )}
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">
          PNG, JPEG, WebP or SVG. Up to 2 MB. Square images work best.
        </p>
      </div>
    </div>
  );
}
