"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/landing/logo";
import { login, loginMfa, storeToken } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Set when the password was right but a second step is owed.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await login(email.trim(), password);
      if (result.mfa_required && result.challenge_token) {
        setChallenge(result.challenge_token);
        setPending(false);
        return;
      }
      storeToken(result.access_token!, remember);
      router.push("/admin/dashboard");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.",
      );
      setPending(false);
    }
  }

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const result = await loginMfa(challenge!, code.trim());
      storeToken(result.access_token!, remember);
      router.push("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code is not right");
      setPending(false);
    }
  }

  if (challenge) {
    return (
      <div className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-14">
        <div className="w-full max-w-sm">
          <Link href="/" className="inline-flex">
            <Logo />
          </Link>

          <div className="mt-10">
            <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/12 text-brand-ink ring-1 ring-inset ring-primary/20">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              One more step
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter the six-digit code from your authenticator app. A backup
              code works too.
            </p>
          </div>

          <form onSubmit={onVerify} className="mt-8 space-y-4" noValidate>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
              >
                <AlertCircle className="mt-px size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Field
              id="code"
              label="Code"
              type="text"
              value={code}
              onChange={setCode}
              autoComplete="one-time-code"
              placeholder="123456"
              disabled={pending}
            />

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={pending || code.trim().length < 6}
            >
              {pending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Checking…
                </>
              ) : (
                <>
                  Verify
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setChallenge(null);
                setCode("");
                setError(null);
              }}
            >
              <ArrowLeft className="size-4" />
              Use a different account
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center px-6 py-12 sm:px-10 lg:px-14">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex">
          <Logo />
        </Link>

        <div className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to the admin console to manage your organisation.
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

          <Field
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="username"
            placeholder="admin@company.com"
            disabled={pending}
          />

          <Field
            id="password"
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="••••••••"
            disabled={pending}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            }
          />

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={remember}
                onCheckedChange={(v) => setRemember(v === true)}
                disabled={pending}
              />
              <Label
                htmlFor="remember"
                className="text-sm font-normal text-muted-foreground"
              >
                Keep me signed in
              </Label>
            </div>
            <Link
              href="/admin/forgot-password"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
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

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Not an administrator?{" "}
          <Link
            href="/"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to site
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
  disabled,
  trailing,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder: string;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/70 bg-muted/40 px-3.5 py-2.5 transition-colors",
        "focus-within:border-primary/60 focus-within:bg-muted/60",
        "focus-within:ring-[3px] focus-within:ring-primary/20",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Label
            htmlFor={id}
            className="text-[11px] font-medium text-muted-foreground"
          >
            {label}
          </Label>
          <input
            id={id}
            name={id}
            type={type}
            required
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete={autoComplete}
            placeholder={placeholder}
            disabled={disabled}
            className="mt-0.5 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
          />
        </div>
        {trailing}
      </div>
    </div>
  );
}
