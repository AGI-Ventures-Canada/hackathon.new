"use client";

import { useState } from "react";
import { useSignIn, useClerk } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Step =
  | "credentials"
  | "factor"
  | "reset-request"
  | "reset-code"
  | "reset-password";

type OAuthProvider = "oauth_google" | "oauth_github" | "oauth_linkedin_oidc";

const OAUTH_PROVIDER_LABEL: Record<OAuthProvider, string> = {
  oauth_google: "Google",
  oauth_github: "GitHub",
  oauth_linkedin_oidc: "LinkedIn",
};

function isOAuthProvider(strategy: string): strategy is OAuthProvider {
  return (
    strategy === "oauth_google" ||
    strategy === "oauth_github" ||
    strategy === "oauth_linkedin_oidc"
  );
}

export function SignInForm({
  redirectUrl = "/home",
  initialEmail = "",
}: {
  redirectUrl?: string;
  initialEmail?: string;
}) {
  const { signIn, isLoaded, setActive } = useSignIn();
  const { client, setActive: resumeSession } = useClerk();
  const router = useRouter();

  const lastSession = client?.sessions?.[0] ?? null;

  const [identifier, setIdentifier] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<Step>("credentials");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthOnlyProviders, setOauthOnlyProviders] = useState<
    OAuthProvider[] | null
  >(null);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function getOAuthOnlyProviders(
    factors: ReadonlyArray<{ strategy: string }> | undefined,
  ): OAuthProvider[] | null {
    if (!factors) return null;
    const strategies = factors.map((f) => f.strategy);
    if (strategies.includes("password")) return null;
    const providers = strategies.filter(isOAuthProvider);
    const unique = Array.from(new Set(providers));
    return unique.length > 0 ? unique : null;
  }

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError("");
    setOauthOnlyProviders(null);
    setIsSubmitting(true);

    try {
      const result = await signIn.create({ identifier, password });

      if (result.status === "needs_second_factor") {
        setStep("factor");
        return;
      }

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      }
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        const errorCode = err.errors[0]?.code;
        if (errorCode === "strategy_for_user_invalid") {
          const providers = getOAuthOnlyProviders(signIn.supportedFirstFactors ?? undefined);
          if (providers) {
            setOauthOnlyProviders(providers);
            return;
          }
        }
        setError(
          err.errors[0]?.longMessage ||
            err.errors[0]?.message ||
            "Sign in failed",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSecondFactor(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError("");
    setIsSubmitting(true);

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: "totp",
        code,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      }
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(
          err.errors[0]?.longMessage ||
            err.errors[0]?.message ||
            "Verification failed",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError("");
    setIsSubmitting(true);

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier,
      });
      setStep("reset-code");
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(
          err.errors[0]?.longMessage ||
            err.errors[0]?.message ||
            "Reset request failed",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetCode(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError("");
    setIsSubmitting(true);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
      });

      if (result.status === "needs_new_password") {
        setStep("reset-password");
      }
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(
          err.errors[0]?.longMessage ||
            err.errors[0]?.message ||
            "Invalid code",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError("");
    setIsSubmitting(true);

    try {
      const result = await signIn.resetPassword({ password: newPassword });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      }
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(
          err.errors[0]?.longMessage ||
            err.errors[0]?.message ||
            "Password reset failed",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResumeSession() {
    if (!lastSession) return;
    setError("");
    setIsSubmitting(true);
    try {
      await resumeSession({ session: lastSession.id });
      router.push(redirectUrl);
    } catch {
      setError("Session expired. Please sign in again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOAuth(
    provider: "oauth_google" | "oauth_github" | "oauth_linkedin_oidc",
  ) {
    if (!signIn) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: redirectUrl,
      });
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(err.errors[0]?.message || "OAuth failed");
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSubmitting) {
      e.preventDefault();
      const form = (e.target as HTMLElement).closest("form");
      form?.requestSubmit();
    }
  }

  if (step === "factor") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            Enter the code from your authenticator app
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={handleSecondFactor}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        >
          <CardContent className="space-y-4">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="code">Verification code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Verify
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("credentials");
                setCode("");
                setError("");
              }}
            >
              Back to sign in
            </Button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  if (step === "reset-request") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>
            Enter your email to receive a reset code
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleResetRequest} onKeyDown={handleKeyDown}>
          <CardContent className="space-y-4">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
              />
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Send reset code
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("credentials");
                setError("");
              }}
            >
              Back to sign in
            </Button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  if (step === "reset-code") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>Enter the code sent to {identifier}</CardDescription>
        </CardHeader>
        <form
          onSubmit={handleResetCode}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        >
          <CardContent className="space-y-4">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="reset-code">Reset code</Label>
              <Input
                id="reset-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Verify code
            </Button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  if (step === "reset-password") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set new password</CardTitle>
          <CardDescription>
            Choose a new password for your account
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={handleNewPassword}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        >
          <CardContent className="space-y-4">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
                autoComplete="new-password"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Reset password
            </Button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-center">Sign in to your account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {lastSession && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleResumeSession}
              disabled={isSubmitting}
              className="w-full h-auto justify-start gap-3 px-3 py-2.5"
            >
              <Avatar className="size-8 shrink-0">
                <AvatarImage src={lastSession.user?.imageUrl} />
                <AvatarFallback>
                  {lastSession.user?.firstName?.[0]}
                  {lastSession.user?.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {lastSession.user?.fullName ||
                    lastSession.user?.primaryEmailAddress?.emailAddress}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {lastSession.user?.primaryEmailAddress?.emailAddress}
                </p>
              </div>
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
              ) : (
                <span className="text-xs text-muted-foreground shrink-0">
                  Continue
                </span>
              )}
            </Button>
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">
                or use another account
              </span>
              <Separator className="flex-1" />
            </div>
          </>
        )}
        <OAuthButtons onOAuth={handleOAuth} />
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <form
          id="sign-in-form"
          onSubmit={handleCredentials}
          onKeyDown={handleKeyDown}
          className="space-y-4"
        >
          {error && <p className="text-xs text-destructive">{error}</p>}
          {oauthOnlyProviders && (
            <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">
                {oauthOnlyProviders.length === 1
                  ? `This account signs in with ${OAUTH_PROVIDER_LABEL[oauthOnlyProviders[0]]}.`
                  : "This account doesn't use a password. Use one of these to sign in:"}
              </p>
              <div className="flex flex-col gap-2">
                {oauthOnlyProviders.map((provider) => (
                  <Button
                    key={provider}
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => handleOAuth(provider)}
                  >
                    Continue with {OAUTH_PROVIDER_LABEL[provider]}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="identifier">Email</Label>
            <Input
              id="identifier"
              type="email"
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (oauthOnlyProviders) setOauthOnlyProviders(null);
              }}
              placeholder="you@example.com"
              autoFocus
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                className="text-xs text-primary hover:text-primary/80"
                onClick={() => {
                  setStep("reset-request");
                  setError("");
                }}
              >
                Forgot password?
              </button>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-3 border-none">
        <Button
          type="submit"
          form="sign-in-form"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 className="animate-spin" />}
          Sign in
        </Button>
        <p className="text-xs text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href={
              redirectUrl && redirectUrl !== "/home"
                ? `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`
                : "/sign-up"
            }
            className="text-primary hover:text-primary/80"
          >
            Sign up
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
