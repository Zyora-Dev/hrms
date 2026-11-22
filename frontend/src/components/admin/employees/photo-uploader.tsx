"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { IconButton } from "@/components/admin/icon-button";
import {
  ApiError,
  deletePhoto,
  initials,
  uploadPhoto,
  type Employee,
} from "./shared";

const ACCEPT = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

export function PhotoUploader({
  employee,
  onChange,
}: {
  employee: Employee;
  onChange: (e: Employee) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ACCEPT.includes(file.type)) {
      toast.error("Photo must be a PNG, JPEG or WebP image");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Photo must be 2 MB or smaller");
      return;
    }

    setPreview(URL.createObjectURL(file));
    setBusy(true);
    try {
      onChange(await uploadPhoto(employee.id, file));
      toast.success("Photo updated");
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
      onChange(await deletePhoto(employee.id));
      setPreview(null);
      toast.success("Photo removed");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not remove photo");
    } finally {
      setBusy(false);
    }
  }

  const src = preview ?? employee.photo_url;

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={employee.full_name}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-lg font-semibold text-muted-foreground">
            {initials(employee.full_name)}
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </span>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold">Employee photo</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          onChange={onPick}
          className="hidden"
        />
        <div className="mt-2 flex h-9 items-center gap-2">
          <IconButton
            label={src ? "Replace photo" : "Upload photo"}
            icon={ImageUp}
            variant="brand"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          />
          {employee.photo_url && (
            <IconButton
              label="Delete photo"
              icon={Trash2}
              variant="destructive"
              disabled={busy}
              onClick={onRemove}
            />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          PNG, JPEG or WebP. Up to 2 MB.
        </p>
      </div>
    </div>
  );
}
