"use client";

import { useState } from "react";
import { useSignUp } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { CreateOrgForm } from "@/components/auth/create-org-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Step = "register" | "verify" | "create-org";

export function SignUpForm({
  redirectUrl,
  initialEmail = "",
}: {
  redirectUrl?: string;
  initialEmail?: string;
}) {
  const { signUp, isLoaded, setActive } = useSignUp();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("register");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const finalRedirect = redirectUrl || "/onboarding";
  const oauthCompleteUrl = redirectUrl || "/onboarding";

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!signUp) return;
    setError("");
    setIsSubmitting(true);

    try {
      await signUp.create({
        firstName,
        lastName,
        emailAddress: email,
        password,
      });
      await signUp.prepareVerification({ strategy: "email_code" });
      setStep("verify");
    } catch {
      setError("We couldn't create the account. Try signing in or use another method.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!signUp) return;
    setError("");
    setIsSubmitting(true);

    try {
      const result = await signUp.attemptVerification({
        strategy: "email_code",
        code,
      });

      if (result.status === "complete") {
        if (!result.createdSessionId) throw new Error("The new session was missing.");
        await setActive({ session: result.createdSessionId });
        if (redirectUrl) {
          router.replace(redirectUrl);
          return;
        }
        setStep("create-org");
        return;
      }
      setError("We couldn't finish creating your account. Try again.");
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(
          err.errors[0]?.longMessage ||
            err.errors[0]?.message ||
            "Verification failed",
        );
      } else {
        setError(err instanceof Error ? err.message : "Verification failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOAuth(
    provider: "oauth_google" | "oauth_github" | "oauth_linkedin_oidc",
  ) {
    if (!signUp || isSubmitting) return;
    setError("");
    setIsSubmitting(true);
    try {
      await signUp.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: `/sso-callback?redirect_url=${encodeURIComponent(oauthCompleteUrl)}`,
        redirectUrlComplete: oauthCompleteUrl,
      });
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(err.errors[0]?.message || "OAuth failed");
      } else {
        setError("OAuth failed. Check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSubmitting) {
      e.preventDefault();
      const form = (e.target as HTMLElement).closest("form");
      form?.requestSubmit();
    }
  }

  const signInHref = redirectUrl
    ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
    : "/sign-in";

  if (step === "create-org") {
    return <CreateOrgForm redirectUrl={finalRedirect} skipUrl={finalRedirect} />;
  }

  if (step === "verify") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            Enter the verification code sent to {email}
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={handleVerify}
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
                autoComplete="one-time-code"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Verify email
            </Button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-center">Sign up for an account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 mb-0">
        <OAuthButtons onOAuth={handleOAuth} disabled={isSubmitting} />
        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">or</span>
          <Separator className="flex-1" />
        </div>
        <form
          id="sign-up-form"
          onSubmit={handleRegister}
          onKeyDown={handleKeyDown}
          className="space-y-4"
        >
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                autoComplete="given-name"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div id="clerk-captcha" />
        </form>
      </CardContent>
      <CardFooter className="flex-col gap-3 border-none pt-0">
        <Button
          type="submit"
          form="sign-up-form"
          className="w-full"
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2 className="animate-spin" />}
          Sign up
        </Button>
        <p className="text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={signInHref}
            className="text-primary hover:text-primary/80"
          >
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
