import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    Camera,
    ExternalLink,
    Loader2,
    ShieldAlert,
} from "lucide-react";
import { expandMeta } from "../api";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { Avatar } from "../components/Avatar";
import { PostCard } from "../components/PostCard";
import { currentDomain } from "../env";
import { navigate } from "../router";
import { ApiResult, Post, PostMeta, User } from "../types";
import {
    avatarGradient,
    compressAvatarFile,
    compressBannerFile,
    formatBytes,
    resolveMediaRef,
} from "../utils";

export const ProfilePage: React.FC<{ handle: string }> = ({ handle }) => {
    const {
        api,
        user: me,
        appInfo,
        refreshUser,
        openLightbox,
        feedRefreshKey,
        bumpFeed,
        toast,
    } = useApp();
    const [profile, setProfile] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadingKind, setUploadingKind] = useState<
        "avatar" | "banner" | null
    >(null);

    const avatarInputRef = useRef<HTMLInputElement | null>(null);
    const bannerInputRef = useRef<HTMLInputElement | null>(null);

    const loadProfile = useCallback(async () => {
        setLoading(true);
        try {
            const host = currentDomain();
            const [u, rawPosts] = await Promise.all([
                api.query<User | null>("user", host, [handle]),
                api.query<[Post, PostMeta][]>("user_posts", host, handle, 0, 0),
            ]);
            setProfile(u ?? null);
            setPosts((rawPosts || []).map(expandMeta));
        } finally {
            setLoading(false);
        }
    }, [api, handle]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile, feedRefreshKey]);

    const isOwn = Boolean(me && profile && me.id === profile.id);
    const isFollowing = Boolean(
        me && profile && me.followees?.includes(profile.id),
    );

    const handleUploadProfileMedia = async (
        kind: "avatar" | "banner",
        file: File | undefined,
    ) => {
        if (!file || !me) return;
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
                ...(me.settings || {}),
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
            await Promise.all([refreshUser(), loadProfile()]);
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

    const handleToggleFollow = async () => {
        if (!profile) return;
        if (!me) {
            toast("Sign in to follow users", "error");
            return;
        }
        const res = await api.call<ApiResult<boolean>>(
            "toggle_following_user",
            profile.id,
        );
        if (res && "Ok" in res) {
            await Promise.all([refreshUser(), loadProfile()]);
            toast(
                res.Ok
                    ? `Following @${profile.name}`
                    : `Unfollowed @${profile.name}`,
            );
        }
    };

    const handleAdminToggleBan = async () => {
        if (!profile) return;
        const res = await api.call<ApiResult<boolean>>(
            "admin_toggle_ban_user",
            profile.id,
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        if (res && "Ok" in res) {
            toast(
                res.Ok
                    ? `Suspended @${profile.name}`
                    : `Restored @${profile.name}`,
            );
            await loadProfile();
        }
    };

    const bannerUrl = resolveMediaRef(profile?.settings?.banner);
    const avatarUrl = resolveMediaRef(profile?.settings?.avatar);
    const displayName = profile?.settings?.display_name?.trim();
    const website = profile?.settings?.website?.trim();
    const safeWebsite =
        website &&
        (website.startsWith("https://") || website.startsWith("http://"))
            ? website
            : null;

    const usedBytes = appInfo?.storage_used_bytes ?? 0;
    const quotaBytes = appInfo?.storage_quota_bytes ?? 50 * 1024 * 1024;
    const quotaPct = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));

    return (
        <div>
            <div className="sticky top-0 z-20 ui-glass border-b ui-border px-4 py-3 flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="p-1.5 rounded-full ui-hover ui-text cursor-pointer"
                >
                    <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                    <h1 className="font-bold text-base">
                        {displayName || `@${profile?.name || handle}`}
                    </h1>
                    {profile && (
                        <p className="text-xs ui-text-muted">
                            {profile.num_posts}{" "}
                            {profile.num_posts === 1 ? "post" : "posts"}
                        </p>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="py-12 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin ui-text-muted" />
                </div>
            ) : !profile ? (
                <div className="py-14 text-center text-sm ui-text-muted">
                    User @{handle} was not found.
                </div>
            ) : (
                <>
                    {/* Hidden file inputs for one-click profile media uploads */}
                    {isOwn && (
                        <>
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
                        </>
                    )}

                    {/* Cover / Banner Photo */}
                    <div
                        className="relative h-36 sm:h-44 w-full overflow-hidden border-b ui-border"
                        style={
                            bannerUrl
                                ? undefined
                                : {
                                      background: avatarGradient(profile.name),
                                      opacity: 0.85,
                                  }
                        }
                    >
                        {bannerUrl && (
                            <img
                                src={bannerUrl}
                                alt="Profile cover"
                                onClick={() =>
                                    openLightbox(
                                        bannerUrl,
                                        `@${profile.name}'s cover photo`,
                                    )
                                }
                                className="w-full h-full object-cover cursor-pointer"
                            />
                        )}
                        {isOwn && (
                            <button
                                type="button"
                                disabled={uploadingKind !== null}
                                onClick={() => bannerInputRef.current?.click()}
                                className="absolute right-3 bottom-3 px-3 py-1.5 rounded-full bg-black/65 hover:bg-black/80 text-white text-xs font-medium inline-flex items-center gap-1.5 backdrop-blur-sm transition cursor-pointer disabled:opacity-50"
                            >
                                {uploadingKind === "banner" ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Camera className="w-3.5 h-3.5" />
                                )}
                                <span>
                                    {bannerUrl ? "Change cover" : "Add cover"}
                                </span>
                            </button>
                        )}
                    </div>

                    {/* Profile Header Body */}
                    <div className="px-4 pb-5 border-b ui-border space-y-4">
                        <div className="flex items-end justify-between gap-3 -mt-10 relative z-10">
                            <div className="relative group">
                                <Avatar
                                    name={profile.name}
                                    avatarRef={profile.settings?.avatar}
                                    size="xl"
                                    rounded="full"
                                    className="ring-4 ring-[var(--ui-bg)] shadow-md"
                                    onClick={
                                        isOwn
                                            ? () =>
                                                  avatarInputRef.current?.click()
                                            : avatarUrl
                                              ? () =>
                                                    openLightbox(
                                                        avatarUrl,
                                                        `@${profile.name}`,
                                                    )
                                              : undefined
                                    }
                                    title={
                                        isOwn
                                            ? "Click to change profile picture"
                                            : `@${profile.name}`
                                    }
                                />
                                {isOwn && (
                                    <button
                                        type="button"
                                        disabled={uploadingKind !== null}
                                        onClick={() =>
                                            avatarInputRef.current?.click()
                                        }
                                        className="absolute right-0 bottom-0 w-7 h-7 rounded-full ui-accent-bg flex items-center justify-center shadow-md cursor-pointer disabled:opacity-50"
                                        title="Change profile picture"
                                    >
                                        {uploadingKind === "avatar" ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                            <Camera className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                )}
                            </div>

                            <div className="flex items-center gap-2 pt-12">
                                {isOwn ? (
                                    <button
                                        type="button"
                                        onClick={() => navigate("/settings")}
                                        className="px-4 py-1.5 rounded-full border ui-border-strong text-xs font-semibold ui-hover cursor-pointer"
                                    >
                                        Edit profile
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={handleToggleFollow}
                                            className={`px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                                                isFollowing
                                                    ? "ui-pill ui-text-secondary"
                                                    : "ui-accent-bg"
                                            }`}
                                        >
                                            {isFollowing
                                                ? "Following"
                                                : "Follow"}
                                        </button>
                                        {appInfo?.is_admin && (
                                            <button
                                                type="button"
                                                onClick={handleAdminToggleBan}
                                                className="px-3 py-1.5 rounded-full border ui-border-strong text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                                style={{
                                                    color: "var(--ui-danger)",
                                                }}
                                            >
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                                <span>
                                                    {profile.deactivated
                                                        ? "Restore"
                                                        : "Suspend"}
                                                </span>
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="font-bold text-lg leading-tight">
                                    {displayName || `@${profile.name}`}
                                </h2>
                                {profile.deactivated && (
                                    <span
                                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                        style={{
                                            backgroundColor:
                                                "var(--ui-danger-soft)",
                                            color: "var(--ui-danger)",
                                        }}
                                    >
                                        Suspended
                                    </span>
                                )}
                            </div>
                            <div className="text-xs ui-text-muted">
                                @{profile.name}
                            </div>
                            {profile.about && (
                                <p className="text-sm ui-text-secondary leading-relaxed whitespace-pre-wrap pt-1">
                                    {profile.about}
                                </p>
                            )}
                            {safeWebsite && (
                                <a
                                    href={safeWebsite}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs ui-accent-text hover:underline pt-0.5"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>
                                        {safeWebsite.replace(
                                            /^https?:\/\//,
                                            "",
                                        )}
                                    </span>
                                </a>
                            )}
                        </div>

                        <div className="flex items-center flex-wrap gap-4 text-xs">
                            <span>
                                <strong className="ui-text">
                                    {profile.followees?.length || 0}
                                </strong>{" "}
                                <span className="ui-text-muted">Following</span>
                            </span>
                            <span>
                                <strong className="ui-text">
                                    {profile.followers?.length || 0}
                                </strong>{" "}
                                <span className="ui-text-muted">Followers</span>
                            </span>
                            <span>
                                <strong className="ui-text">
                                    {profile.realms?.length || 0}
                                </strong>{" "}
                                <span className="ui-text-muted">
                                    {BRAND.communityPlural}
                                </span>
                            </span>
                        </div>

                        {isOwn && appInfo && (
                            <div className="rounded-xl ui-surface border ui-border p-3 space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium ui-text">
                                        Shared Media Storage
                                    </span>
                                    <span className="ui-text-muted font-mono">
                                        {formatBytes(usedBytes)} /{" "}
                                        {formatBytes(quotaBytes)}
                                    </span>
                                </div>
                                <div className="h-1.5 rounded-full ui-surface-2 overflow-hidden">
                                    <div
                                        className="h-full rounded-full ui-accent-bg"
                                        style={{ width: `${quotaPct}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {posts.length === 0 ? (
                        <div className="py-12 text-center text-sm ui-text-muted">
                            No posts yet.
                        </div>
                    ) : (
                        posts.map((p) => (
                            <PostCard
                                key={p.id}
                                post={p}
                                onDeleted={(id) =>
                                    setPosts((prev) =>
                                        prev.filter((x) => x.id !== id),
                                    )
                                }
                            />
                        ))
                    )}
                </>
            )}
        </div>
    );
};
