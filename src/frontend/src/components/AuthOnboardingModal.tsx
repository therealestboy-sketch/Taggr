import React, { useEffect, useState } from "react";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { ApiResult } from "../types";
import { BrandLogo } from "./BrandLogo";

export const AuthOnboardingModal: React.FC = () => {
    const { api, needsOnboarding, refreshUser, signOut, toast } = useApp();
    const [handle, setHandle] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const trimmed = handle.trim();
        if (!trimmed) {
            setValidationError(null);
            return;
        }
        const timer = setTimeout(async () => {
            const res = await api.query<ApiResult<null>>(
                "validate_username",
                trimmed,
            );
            if (res && "Err" in res) {
                setValidationError(res.Err);
            } else {
                setValidationError(null);
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [api, handle]);

    if (!needsOnboarding) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = handle.trim();
        if (!trimmed || validationError) return;
        setSubmitting(true);
        try {
            const res = await api.call<ApiResult<string | null>>(
                "create_user",
                trimmed,
                "",
            );
            if (!res) {
                toast("Could not create account. Please try again.", "error");
            } else if ("Err" in res) {
                setValidationError(res.Err);
            } else {
                await refreshUser();
                toast(`Welcome to ${BRAND.name}, @${trimmed}!`);
            }
        } catch (err) {
            toast(
                err instanceof Error ? err.message : "Registration failed",
                "error",
            );
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-md rounded-2xl border ui-border-strong ui-surface p-6 space-y-5 shadow-2xl"
            >
                <div className="space-y-2">
                    <BrandLogo />
                    <h2 className="text-lg font-bold ui-text pt-1">
                        Choose your handle
                    </h2>
                    <p className="text-xs ui-text-secondary leading-relaxed">
                        You are signed in with Internet Identity. Pick a unique
                        username to start posting, joining{" "}
                        {BRAND.communityPlural.toLowerCase()}, and uploading
                        photos — completely free.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <label className="block text-xs font-medium ui-text-secondary">
                        Username
                    </label>
                    <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm ui-text-muted">
                            @
                        </span>
                        <input
                            type="text"
                            autoFocus
                            maxLength={20}
                            value={handle}
                            onChange={(e) => setHandle(e.target.value)}
                            placeholder="yourname"
                            className="w-full rounded-xl ui-surface-2 border ui-border pl-8 pr-3.5 py-2.5 text-sm ui-text focus:outline-none"
                        />
                    </div>
                    {validationError ? (
                        <p
                            className="text-xs"
                            style={{ color: "var(--ui-danger)" }}
                        >
                            {validationError}
                        </p>
                    ) : (
                        <p className="text-xs ui-text-muted">
                            Letters, numbers, underscores, and hyphens (2–20
                            characters).
                        </p>
                    )}
                </div>

                <div className="flex items-center justify-between pt-1">
                    <button
                        type="button"
                        onClick={signOut}
                        className="text-xs ui-text-muted hover:underline cursor-pointer"
                    >
                        Cancel &amp; sign out
                    </button>
                    <button
                        type="submit"
                        disabled={
                            submitting || !handle.trim() || !!validationError
                        }
                        className="px-5 py-2 rounded-full ui-accent-bg text-xs font-semibold disabled:opacity-50 transition cursor-pointer"
                    >
                        {submitting ? "Creating..." : "Create profile"}
                    </button>
                </div>
            </form>
        </div>
    );
};
