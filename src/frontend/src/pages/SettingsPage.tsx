import React, { useEffect, useState } from "react";
import { LogOut, Moon, Shield, Sun } from "lucide-react";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { ApiResult } from "../types";
import { formatBytes } from "../utils";

export const SettingsPage: React.FC = () => {
    const {
        api,
        user,
        principalId,
        appInfo,
        theme,
        toggleTheme,
        signIn,
        signOut,
        refreshUser,
        toast,
    } = useApp();

    const [about, setAbout] = useState(user?.about || "");
    const [newName, setNewName] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);

    // Admin controls state
    const [bucketId, setBucketId] = useState(appInfo?.media_bucket || "");
    const [customDomain, setCustomDomain] = useState("");
    const [newAdminPrincipal, setNewAdminPrincipal] = useState("");

    useEffect(() => {
        setAbout(user?.about || "");
    }, [user?.about]);

    useEffect(() => {
        setBucketId(appInfo?.media_bucket || "");
    }, [appInfo?.media_bucket]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSavingProfile(true);
        try {
            const res = await api.call<ApiResult<null>>(
                "update_user",
                newName.trim(),
                about.trim(),
                { age_days: 0, safe: false, balance: 0, num_followers: 0 },
                false,
                "Mining",
                user.show_posts_in_realms,
            );
            if (res && "Err" in res) {
                toast(res.Err, "error");
            } else {
                setNewName("");
                await refreshUser();
                toast("Profile updated");
            }
        } finally {
            setSavingProfile(false);
        }
    };

    const handleSetBucket = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await api.call<ApiResult<null>>(
            "admin_set_media_bucket",
            bucketId.trim(),
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
        } else {
            await refreshUser();
            toast("Shared media bucket updated");
        }
    };

    const handleAddDomain = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customDomain.trim()) return;
        const res = await api.call<ApiResult<null>>(
            "admin_add_domain",
            customDomain.trim(),
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
        } else {
            setCustomDomain("");
            await refreshUser();
            toast("Custom domain added to /.well-known/ic-domains");
        }
    };

    const handleAddAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAdminPrincipal.trim()) return;
        const res = await api.call<ApiResult<null>>(
            "admin_add_admin",
            newAdminPrincipal.trim(),
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
        } else {
            setNewAdminPrincipal("");
            toast("Admin principal added");
        }
    };

    return (
        <div>
            <div className="sticky top-0 z-20 ui-glass border-b ui-border px-4 py-3">
                <h1 className="font-bold text-base">
                    {appInfo?.is_admin ? "Settings & Admin" : "Settings"}
                </h1>
            </div>

            <div className="p-4 space-y-6">
                {/* Appearance */}
                <section className="rounded-2xl ui-surface border ui-border p-4 space-y-3">
                    <h2 className="font-semibold text-sm">Appearance</h2>
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm ui-text">Colour theme</div>
                            <div className="text-xs ui-text-muted">
                                Switch between dark and light mode.
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={toggleTheme}
                            className="px-3.5 py-2 rounded-full ui-surface-2 border ui-border text-xs font-medium inline-flex items-center gap-2 ui-hover cursor-pointer"
                        >
                            {theme === "dark" ? (
                                <>
                                    <Moon className="w-3.5 h-3.5" />
                                    <span>Dark</span>
                                </>
                            ) : (
                                <>
                                    <Sun className="w-3.5 h-3.5" />
                                    <span>Light</span>
                                </>
                            )}
                        </button>
                    </div>
                </section>

                {/* Account & Profile */}
                <section className="rounded-2xl ui-surface border ui-border p-4 space-y-4">
                    <h2 className="font-semibold text-sm">Profile & Account</h2>
                    {!user ? (
                        <div className="space-y-3">
                            <p className="text-xs ui-text-secondary">
                                Sign in with a Passkey via Internet Identity to
                                customise your profile.
                            </p>
                            <button
                                type="button"
                                onClick={signIn}
                                className="px-4 py-2 rounded-full ui-accent-bg text-xs font-semibold cursor-pointer"
                            >
                                Sign in with Passkey
                            </button>
                        </div>
                    ) : (
                        <form
                            onSubmit={handleSaveProfile}
                            className="space-y-3"
                        >
                            <div>
                                <label className="block text-xs ui-text-secondary mb-1">
                                    Current handle
                                </label>
                                <div className="text-sm font-semibold ui-text">
                                    @{user.name}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs ui-text-secondary mb-1">
                                    Change handle (optional)
                                </label>
                                <input
                                    type="text"
                                    maxLength={20}
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Leave blank to keep current handle"
                                    className="w-full rounded-xl ui-surface-2 border ui-border px-3.5 py-2 text-sm ui-text focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-xs ui-text-secondary mb-1">
                                    Bio
                                </label>
                                <textarea
                                    rows={3}
                                    value={about}
                                    onChange={(e) => setAbout(e.target.value)}
                                    placeholder="Tell people a little about yourself..."
                                    className="w-full rounded-xl ui-surface-2 border ui-border px-3.5 py-2 text-sm ui-text focus:outline-none resize-none"
                                />
                            </div>

                            {principalId && (
                                <div className="text-[11px] ui-text-muted font-mono break-all">
                                    Principal: {principalId}
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-2">
                                <button
                                    type="button"
                                    onClick={signOut}
                                    className="px-3.5 py-2 rounded-full ui-pill text-xs font-medium ui-text-secondary inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                    <LogOut className="w-3.5 h-3.5" />
                                    <span>Sign out</span>
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingProfile}
                                    className="px-4 py-2 rounded-full ui-accent-bg text-xs font-semibold disabled:opacity-50 cursor-pointer"
                                >
                                    {savingProfile
                                        ? "Saving..."
                                        : "Save changes"}
                                </button>
                            </div>
                        </form>
                    )}
                </section>

                {/* Admin Panel */}
                {appInfo?.is_admin && (
                    <section className="rounded-2xl ui-surface border ui-border-strong p-4 space-y-5">
                        <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 ui-accent-text" />
                            <h2 className="font-semibold text-sm">
                                Admin Console
                            </h2>
                        </div>

                        {/* Live Overview */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-xl ui-surface-2 p-2.5">
                                <div className="font-bold text-base">
                                    {appInfo.users_count}
                                </div>
                                <div className="text-[11px] ui-text-muted">
                                    Users
                                </div>
                            </div>
                            <div className="rounded-xl ui-surface-2 p-2.5">
                                <div className="font-bold text-base">
                                    {appInfo.posts_count}
                                </div>
                                <div className="text-[11px] ui-text-muted">
                                    Posts
                                </div>
                            </div>
                            <div className="rounded-xl ui-surface-2 p-2.5">
                                <div className="font-bold text-base">
                                    {appInfo.spaces_count}
                                </div>
                                <div className="text-[11px] ui-text-muted">
                                    {BRAND.communityPlural}
                                </div>
                            </div>
                        </div>

                        <div className="text-xs ui-text-muted space-y-0.5">
                            <div>
                                Limits: {appInfo.max_posts_per_day} posts/day ·{" "}
                                {appInfo.max_comments_per_hour} replies/hour ·{" "}
                                {appInfo.max_spaces_per_user}{" "}
                                {BRAND.communityPlural}/user
                            </div>
                            <div>
                                Media cap:{" "}
                                {formatBytes(appInfo.max_blob_size_bytes)}/image
                                · {formatBytes(appInfo.storage_quota_bytes)}
                                /user
                            </div>
                        </div>

                        {/* Shared Media Bucket */}
                        <form onSubmit={handleSetBucket} className="space-y-2">
                            <label className="block text-xs font-medium ui-text-secondary">
                                Shared media bucket canister ID
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={bucketId}
                                    onChange={(e) =>
                                        setBucketId(e.target.value)
                                    }
                                    placeholder="xxxxx-xxxxx-xxxxx-xxxxx-cai"
                                    className="flex-1 rounded-xl ui-surface-2 border ui-border px-3 py-2 text-xs font-mono ui-text focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-xl ui-accent-bg text-xs font-semibold cursor-pointer"
                                >
                                    Save
                                </button>
                            </div>
                        </form>

                        {/* Custom Domain */}
                        <form onSubmit={handleAddDomain} className="space-y-2">
                            <label className="block text-xs font-medium ui-text-secondary">
                                Register custom domain (served in
                                /.well-known/ic-domains)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={customDomain}
                                    onChange={(e) =>
                                        setCustomDomain(e.target.value)
                                    }
                                    placeholder="social.yourdomain.com"
                                    className="flex-1 rounded-xl ui-surface-2 border ui-border px-3 py-2 text-xs ui-text focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-xl ui-accent-bg text-xs font-semibold cursor-pointer"
                                >
                                    Add
                                </button>
                            </div>
                            <div className="text-[11px] ui-text-muted">
                                Active domains:{" "}
                                {appInfo.domains
                                    .filter((d) => d !== "localhost")
                                    .join(", ") || "none"}
                            </div>
                        </form>

                        {/* Add Admin Principal */}
                        <form onSubmit={handleAddAdmin} className="space-y-2">
                            <label className="block text-xs font-medium ui-text-secondary">
                                Grant admin role to principal
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newAdminPrincipal}
                                    onChange={(e) =>
                                        setNewAdminPrincipal(e.target.value)
                                    }
                                    placeholder="Principal ID"
                                    className="flex-1 rounded-xl ui-surface-2 border ui-border px-3 py-2 text-xs font-mono ui-text focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-xl ui-accent-bg text-xs font-semibold cursor-pointer"
                                >
                                    Grant
                                </button>
                            </div>
                        </form>
                    </section>
                )}
            </div>
        </div>
    );
};
