"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/landing/logo";
import { employeeLogin, storeEmployeeToken } from "@/lib/employee-auth";

export function EmployeeLoginForm() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { access_token } = await employeeLogin(code.trim(), password);
      storeEmployeeToken(access_token, remember);
      router.push("/employee");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid employee ID or password",
      );
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex">
          <Logo />
        </Link>

        <div className="mt-10">
          <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
            <IdCard className="size-5" />
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            Employee sign in
          </h1>
          <p className="mt-2 text-sm text-foreground/80">
            Use the employee ID on your card and the password your HR team gave
            you.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-px size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="employee-code" className="text-xs font-semibold">
              Employee ID
            </Label>
            <Input
              id="employee-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="EMP-0001"
              autoComplete="username"
              autoCapitalize="characters"
              disabled={pending}
              className="h-11 font-mono"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="employee-password" className="text-xs font-semibold">
              Password
            </Label>
            <div className="relative">
              <Input
                id="employee-password"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={pending}
                className="h-11 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/60 transition-colors hover:text-foreground"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="employee-remember"
              checked={remember}
              onCheckedChange={(v) => setRemember(v === true)}
              disabled={pending}
            />
            <Label
              htmlFor="employee-remember"
              className="text-sm font-normal text-foreground/80"
            >
              Keep me signed in
            </Label>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={pending || !code.trim() || !password}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-foreground/70">
          Forgotten your password? Your HR team can reset it for you.
        </p>

        <p className="mt-8 text-center text-sm text-foreground/80">
          Administrator?{" "}
          <Link
            href="/admin/login"
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            Sign in here
          </Link>
        </p>
      </div>
    </div>
  );
}
