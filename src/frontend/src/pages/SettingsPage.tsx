import React, { useEffect, useRef, useState } from "react";
import {
    Camera,
    Loader2,
    LogOut,
    Moon,
    Shield,
    Sun,
    Trash2,
} from "lucide-react";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { Avatar } from "../components/Avatar";
import { ApiResult } from "../types";
import {
    avatarGradient,
    compressAvatarFile,
    compressBannerFile,
    formatBytes,
    resolveMediaRef,
} from "../utils";

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
        bumpFeed,
        toast,
    } = useApp();

    const [displayName, setDisplayName] = useState(
        user?.settings?.display_name || "",
    );
    const [website, setWebsite] = useState(user?.settings?.website || "");
    const [about, setAbout] = useState(user?.about || "");
    const [newName, setNewName] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);
    const [uploadingKind, setUploadingKind] = useState<
        "avatar" | "banner" | null
    >(null);

    const avatarInputRef = useRef<HTMLInputElement | null>(null);
    const bannerInputRef = useRef<HTMLInputElement | null>(null);

    // Admin controls state
    const [bucketId, setBucketId] = useState(appInfo?.media_bucket || "");
    const [customDomain, setCustomDomain] = useState("");
    const [newAdminPrincipal, setNewAdminPrincipal] = useState("");

    useEffect(() => {
        setAbout(user?.about || "");
        setDisplayName(user?.settings?.display_name || "");
        setWebsite(user?.settings?.website || "");
    }, [user]);

    useEffect(() => {
        setBucketId(appInfo?.media_bucket || "");
    }, [appInfo?.media_bucket]);

    const handleUploadProfileMedia = async (
        kind: "avatar" | "banner",
        file: File | undefined,
    ) => {
        if (!file || !user) return;
        if (!appInfo?.media_bucket) {
            toast("Shared media storage is not configured yet.", "error");
            return;
        }
        setUploadingKind(kind);
        try {
            const maxBytes = appInfo.max_blob_size_bytes || 512 * 1024;
            const bytes =
                kind === "avatar"
                    ? await compressAvatarFile(file, maxBytes)
                    : await compressBannerFile(file, maxBytes);
            const uploaded = await api.upload_media(bytes);
            if (!uploaded) {
                toast("Upload failed. Please try again.", "error");
                return;
            }
            if ("Err" in uploaded && uploaded.Err) {
                toast(uploaded.Err, "error");
                return;
            }
            if (!uploaded.Ok) return;
            const [, offset, len] = uploaded.Ok;
            const mediaRef = `${appInfo.media_bucket}:${Number(offset)}:${Number(len)}`;
            const nextSettings = {
                ...(user.settings || {}),
                [kind]: mediaRef,
            };
            const saveRes = await api.call<ApiResult<null>>(
                "update_user_settings",
                nextSettings,
            );
            if (saveRes && "Err" in saveRes) {
                toast(saveRes.Err, "error");
                return;
            }
            await refreshUser();
            bumpFeed();
            toast(
                kind === "avatar"
                    ? "Profile picture updated"
                    : "Cover photo updated",
            );
        } catch (err) {
            toast(
                err instanceof Error ? err.message : "Upload failed",
                "error",
            );
        } finally {
            setUploadingKind(null);
        }
    };

    const handleRemoveProfileMedia = async (kind: "avatar" | "banner") => {
        if (!user) return;
        const nextSettings = { ...(user.settings || {}) };
        delete nextSettings[kind];
        const saveRes = await api.call<ApiResult<null>>(
            "update_user_settings",
            nextSettings,
        );
        if (saveRes && "Err" in saveRes) {
            toast(saveRes.Err, "error");
            return;
        }
        await refreshUser();
        bumpFeed();
        toast(
            kind === "avatar"
                ? "Profile picture removed"
                : "Cover photo removed",
        );
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const trimmedWebsite = website.trim();
        if (
            trimmedWebsite &&
            !trimmedWebsite.startsWith("https://") &&
            !trimmedWebsite.startsWith("http://")
        ) {
            toast("Website URL must start with https:// or http://", "error");
            return;
        }
        setSavingProfile(true);
        try {
            const nextSettings: Record<string, string> = {
                ...(user.settings || {}),
            };
            if (displayName.trim()) {
                nextSettings.display_name = displayName.trim().slice(0, 40);
            } else {
                delete nextSettings.display_name;
            }
            if (trimmedWebsite) {
                nextSettings.website = trimmedWebsite;
            } else {
                delete nextSettings.website;
            }

            const [profileRes, settingsRes] = await Promise.all([
                api.call<ApiResult<null>>(
                    "update_user",
                    newName.trim(),
                    about.trim(),
                    { age_days: 0, safe: false, balance: 0, num_followers: 0 },
                    false,
                    "Mining",
                    user.show_posts_in_realms,
                ),
                api.call<ApiResult<null>>("update_user_settings", nextSettings),
            ]);

            if (profileRes && "Err" in profileRes) {
                toast(profileRes.Err, "error");
            } else if (settingsRes && "Err" in settingsRes) {
                toast(settingsRes.Err, "error");
            } else {
                setNewName("");
                await refreshUser();
                bumpFeed();
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

    const bannerUrl = resolveMediaRef(user?.settings?.banner);

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
                        <>
                            {/* Profile Picture & Cover Photo Uploader */}
                            <input
                                ref={avatarInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    e.target.value = "";
                                    handleUploadProfileMedia("avatar", f);
                                }}
                            />
                            <input
                                ref={bannerInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    e.target.value = "";
                                    handleUploadProfileMedia("banner", f);
                                }}
                            />

                            <div className="space-y-3">
                                <div
                                    className="relative h-28 w-full rounded-xl overflow-hidden border ui-border"
                                    style={
                                        bannerUrl
                                            ? undefined
                                            : {
                                                  background: avatarGradient(
                                                      user.name,
                                                  ),
                                                  opacity: 0.85,
                                              }
                                    }
                                >
                                    {bannerUrl && (
                                        <img
                                            src={bannerUrl}
                                            alt="Cover preview"
                                            className="w-full h-full object-cover"
                                        />
                                    )}
                                    <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            disabled={uploadingKind !== null}
                                            onClick={() =>
                                                bannerInputRef.current?.click()
                                            }
                                            className="px-2.5 py-1 rounded-full bg-black/65 hover:bg-black/80 text-white text-xs font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                        >
                                            {uploadingKind === "banner" ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : (
                                                <Camera className="w-3 h-3" />
                                            )}
                                            <span>
                                                {bannerUrl
                                                    ? "Change cover"
                                                    : "Upload cover"}
                                            </span>
                                        </button>
                                        {bannerUrl && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleRemoveProfileMedia(
                                                        "banner",
                                                    )
                                                }
                                                className="p-1.5 rounded-full bg-black/65 hover:bg-black/80 text-white cursor-pointer"
                                                title="Remove cover photo"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <Avatar
                                            name={user.name}
                                            avatarRef={user.settings?.avatar}
                                            size="lg"
                                            rounded="full"
                                        />
                                        <div>
                                            <div className="text-sm font-medium ui-text">
                                                Profile picture
                                            </div>
                                            <div className="text-xs ui-text-muted">
                                                Auto-cropped to a square ·
                                                Stored in shared media bucket
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            type="button"
                                            disabled={uploadingKind !== null}
                                            onClick={() =>
                                                avatarInputRef.current?.click()
                                            }
                                            className="px-3 py-1.5 rounded-full ui-accent-soft text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                        >
                                            {uploadingKind === "avatar" ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Camera className="w-3.5 h-3.5" />
                                            )}
                                            <span>Upload</span>
                                        </button>
                                        {user.settings?.avatar && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleRemoveProfileMedia(
                                                        "avatar",
                                                    )
                                                }
                                                className="p-1.5 rounded-full ui-hover ui-text-muted cursor-pointer"
                                                title="Remove profile picture"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <form
                                onSubmit={handleSaveProfile}
                                toolname="update_profile"
                                tooldescription="Update the signed-in user's public Relay profile details."
                                className="space-y-3 pt-2 border-t ui-border"
                            >
                                <div>
                                    <label className="block text-xs ui-text-secondary mb-1">
                                        Display name
                                    </label>
                                    <input
                                        type="text"
                                        name="display_name"
                                        toolparamdescription="Public display name shown alongside your handle (e.g. Alex Rivera)."
                                        maxLength={40}
                                        value={displayName}
                                        onChange={(e) =>
                                            setDisplayName(e.target.value)
                                        }
                                        placeholder="e.g. Alex Rivera"
                                        className="w-full rounded-xl ui-surface-2 border ui-border px-3.5 py-2 text-sm ui-text focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs ui-text-secondary mb-1">
                                        Handle (@{user.name})
                                    </label>
                                    <input
                                        type="text"
                                        name="new_handle"
                                        toolparamdescription="Optional replacement username without @; leave blank to keep the current handle."
                                        maxLength={20}
                                        value={newName}
                                        onChange={(e) =>
                                            setNewName(e.target.value)
                                        }
                                        placeholder="Leave blank to keep current handle"
                                        className="w-full rounded-xl ui-surface-2 border ui-border px-3.5 py-2 text-sm ui-text focus:outline-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs ui-text-secondary mb-1">
                                        Bio
                                    </label>
                                    <textarea
                                        name="bio"
                                        toolparamdescription="Short personal biography displayed on the profile page."
                                        rows={3}
                                        value={about}
                                        onChange={(e) =>
                                            setAbout(e.target.value)
                                        }
                                        placeholder="Tell people a little about yourself..."
                                        className="w-full rounded-xl ui-surface-2 border ui-border px-3.5 py-2 text-sm ui-text focus:outline-none resize-none"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs ui-text-secondary mb-1">
                                        Website (optional)
                                    </label>
                                    <input
                                        type="url"
                                        name="website"
                                        toolparamdescription="Personal website or portfolio URL starting with https:// (e.g. https://yoursite.com)."
                                        value={website}
                                        onChange={(e) =>
                                            setWebsite(e.target.value)
                                        }
                                        placeholder="https://yoursite.com"
                                        className="w-full rounded-xl ui-surface-2 border ui-border px-3.5 py-2 text-sm ui-text focus:outline-none"
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
                        </>
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

                        <form
                            onSubmit={handleSetBucket}
                            toolname="admin_set_media_bucket"
                            tooldescription="Configure the shared Internet Computer media bucket canister ID used for image uploads."
                            className="space-y-2"
                        >
                            <label className="block text-xs font-medium ui-text-secondary">
                                Shared media bucket canister ID
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    name="bucket_canister_id"
                                    toolparamdescription="Internet Computer canister principal ID for the shared media bucket (e.g. 52rcs-naaaa-aaaao-qqosa-cai)."
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

                        <form
                            onSubmit={handleAddDomain}
                            toolname="admin_register_custom_domain"
                            tooldescription="Register a custom hostname in /.well-known/ic-domains for this Relay canister."
                            className="space-y-2"
                        >
                            <label className="block text-xs font-medium ui-text-secondary">
                                Register custom domain (served in
                                /.well-known/ic-domains)
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    name="domain"
                                    required
                                    toolparamdescription="Custom hostname without protocol or path (e.g. social.yourdomain.com)."
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

                        <form
                            onSubmit={handleAddAdmin}
                            toolname="admin_grant_admin_role"
                            tooldescription="Grant administrator privileges on Relay to another Internet Computer principal."
                            className="space-y-2"
                        >
                            <label className="block text-xs font-medium ui-text-secondary">
                                Grant admin role to principal
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    name="principal_id"
                                    required
                                    toolparamdescription="Textual Internet Computer principal ID to promote to administrator."
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
