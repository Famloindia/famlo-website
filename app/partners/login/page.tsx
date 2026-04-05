"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase";

export default function PartnerLoginPage(): JSX.Element {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const cleanIdentifier = identifier.trim();
    const cleanPassword = password.trim();

    if (!cleanIdentifier || !cleanPassword) {
      setErrorMessage("Enter your user ID or approved email and password.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      if (cleanIdentifier.includes("@")) {
        const supabase = createBrowserSupabaseClient();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanIdentifier.toLowerCase(),
          password: cleanPassword
        });

        if (error || !data.user) {
          setErrorMessage("User ID or password is incorrect.");
          return;
        }

        const resolveResponse = await fetch("/api/partners/resolve-stay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanIdentifier.toLowerCase(), userId: data.user.id })
        });
        const resolvePayload = (await resolveResponse.json()) as { redirect?: string; error?: string };

        if (!resolveResponse.ok || !resolvePayload.redirect) {
          setErrorMessage(resolvePayload.error ?? "No approved partner dashboard was found for this email.");
          return;
        }

        router.push(resolvePayload.redirect);
        return;
      }

      const response = await fetch("/api/partners/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: cleanIdentifier, password: cleanPassword })
      });
      const payload = (await response.json()) as { redirect?: string; error?: string };

      if (!response.ok || !payload.redirect) {
        setErrorMessage(payload.error ?? "User ID or password is incorrect.");
        return;
      }

      router.push(payload.redirect);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not log in right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f6efe5_0%,#fbf9f4_45%,#f4f7fb_100%)] px-6 py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8a6a3d]">Partner Login</p>
          <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[#1f2937] sm:text-5xl">
            One login for Famlo home hosts and hommie partners.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-[#52606d]">
            Use your Famlo Homes host ID and password, or your approved hommie partner email and password.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              "Famlo Homes host ID login",
              "Approved hommie email login",
              "Quarter pricing and calendar sync",
              "Live dashboard linked with the mobile app"
            ].map((item) => (
              <div key={item} className="rounded-[24px] border border-white/70 bg-white/80 px-5 py-4 text-sm font-semibold text-[#1f2937] shadow-[0_18px_60px_rgba(15,23,42,0.05)]">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[36px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-sm font-semibold text-[#1f2937]">Login</p>
          <p className="mt-2 text-sm leading-7 text-[#52606d]">
            Enter your user ID or approved email, then your password.
          </p>

          <form className="mt-8 space-y-5" onSubmit={(event) => void handleLogin(event)}>
            <label className="grid gap-2 text-sm text-[#52606d]">
              User ID or approved email
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="FAM-XXXXXX or approved@email.com"
                className="rounded-2xl border border-[#e5e7eb] px-4 py-4 text-[#1f2937] outline-none"
              />
            </label>

            <label className="grid gap-2 text-sm text-[#52606d]">
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                className="rounded-2xl border border-[#e5e7eb] px-4 py-4 text-[#1f2937] outline-none"
              />
            </label>

            {errorMessage ? (
              <div className="rounded-2xl border border-[#f3c3cb] bg-[#fff5f7] px-4 py-3 text-sm text-[#9f1239]">
                {errorMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#1f2937] px-5 py-4 text-sm font-semibold text-white disabled:opacity-70"
            >
              {loading ? "Checking login..." : "Log in"}
            </button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
            <Link href="/partners/forgot-password" className="font-semibold text-[#8a6a3d]">
              Forgot password?
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/partners" className="inline-flex items-center rounded-full border border-[#1f2937] px-4 py-2 font-semibold text-[#1f2937]">
                Join Famlo
              </Link>
              <Link href="/partners/home" className="text-[#52606d]">
                Need onboarding instead?
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
