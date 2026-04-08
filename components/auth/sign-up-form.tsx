"use client";

import { useState, useEffect, useRef } from "react";
import { useSignUp, useOrganizationList } from "@clerk/nextjs";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Step = "register" | "verify" | "create-org";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidSlugFormat(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function SignUpForm({ redirectUrl }: { redirectUrl?: string }) {
  const { signUp, isLoaded, setActive } = useSignUp();
  const { createOrganization, setActive: setOrgActive } = useOrganizationList();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("register");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgSlugEdited, setOrgSlugEdited] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finalRedirect = redirectUrl || "/onboarding";
  const onboardingUrl = redirectUrl
    ? `/onboarding?redirect_url=${encodeURIComponent(redirectUrl)}`
    : "/onboarding";

  useEffect(() => {
    if (!orgSlugEdited) {
      setOrgSlug(generateSlug(orgName));
    }
  }, [orgName, orgSlugEdited]);

  useEffect(() => {
    if (!orgSlug || !isValidSlugFormat(orgSlug)) {
      setSlugAvailable(null);
      return;
    }

    setIsCheckingSlug(true);
    setSlugAvailable(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/dashboard/organizations/slug-available?slug=${encodeURIComponent(orgSlug)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSlugAvailable(data.available);
        } else {
          setSlugAvailable(null);
        }
      } catch {
        setSlugAvailable(null);
      } finally {
        setIsCheckingSlug(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [orgSlug]);

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
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(
          err.errors[0]?.longMessage ||
            err.errors[0]?.message ||
            "Sign up failed",
        );
      }
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
        await setActive({ session: result.createdSessionId });
        setStep("create-org");
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

  async function handleCreateOrg(e: React.FormEvent) {
    e.preventDefault();
    if (
      !orgName.trim() ||
      !orgSlug ||
      !isValidSlugFormat(orgSlug) ||
      slugAvailable !== true ||
      !createOrganization
    )
      return;

    setIsSubmitting(true);
    setError("");

    try {
      const org = await createOrganization({ name: orgName.trim() });
      await setOrgActive?.({ organization: org.id });

      const res = await fetch("/api/dashboard/org-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: orgSlug }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save organization slug");
      }

      router.push(finalRedirect);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create organization",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOAuth(
    provider: "oauth_google" | "oauth_github" | "oauth_linkedin_oidc",
  ) {
    if (!signUp) return;
    try {
      await signUp.authenticateWithRedirect({
        strategy: provider,
        redirectUrl: "/sso-callback",
        redirectUrlComplete: redirectUrl ? finalRedirect : onboardingUrl,
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

  const signInHref = redirectUrl
    ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
    : "/sign-in";

  const slugStatus = (() => {
    if (!orgSlug) return null;
    if (!isValidSlugFormat(orgSlug)) return "invalid";
    if (isCheckingSlug) return "checking";
    if (slugAvailable === true) return "available";
    if (slugAvailable === false) return "taken";
    return null;
  })();

  const canSubmitOrg =
    orgName.trim().length > 0 &&
    orgSlug.length > 0 &&
    slugStatus === "available" &&
    !isSubmitting;

  if (step === "create-org") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your organization</CardTitle>
          <CardDescription>
            Events are managed under organizations. Set up yours to get started.
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={handleCreateOrg}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        >
          <CardContent className="space-y-4">
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="space-y-4">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                name="org-name"
                placeholder="Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">URL slug</Label>
              <Input
                id="org-slug"
                name="org-slug"
                placeholder="acme-inc"
                value={orgSlug}
                onChange={(e) => {
                  setOrgSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                  );
                  setOrgSlugEdited(true);
                }}
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                required
              />
              {orgSlug && (
                <p
                  className={`text-xs ${
                    slugStatus === "available"
                      ? "text-primary"
                      : slugStatus === "taken" || slugStatus === "invalid"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {slugStatus === "checking" && "Checking availability..."}
                  {slugStatus === "available" && "This slug is available"}
                  {slugStatus === "taken" && "This slug is already taken"}
                  {slugStatus === "invalid" &&
                    "Slugs can only contain lowercase letters, numbers, and hyphens"}
                </p>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button type="submit" className="w-full" disabled={!canSubmitOrg}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              Create organization
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => router.push(finalRedirect)}
            >
              Skip for now
            </Button>
          </CardFooter>
        </form>
      </Card>
    );
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
        <OAuthButtons onOAuth={handleOAuth} />
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
