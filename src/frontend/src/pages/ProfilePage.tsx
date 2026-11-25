import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-react";
import { expandMeta } from "../api";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { PostCard } from "../components/PostCard";
import { currentDomain } from "../env";
import { navigate } from "../router";
import { ApiResult, Post, PostMeta, User } from "../types";
import { avatarGradient, avatarInitials, formatBytes } from "../utils";

export const ProfilePage: React.FC<{ handle: string }> = ({ handle }) => {
    const {
        api,
        user: me,
        appInfo,
        refreshUser,
        feedRefreshKey,
        toast,
    } = useApp();
    const [profile, setProfile] = useState<User | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

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
                        @{profile?.name || handle}
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
                    <div className="px-4 py-5 border-b ui-border space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div
                                className="w-16 h-16 rounded-2xl font-bold text-xl text-white flex items-center justify-center shadow-sm"
                                style={{
                                    background: avatarGradient(profile.name),
                                }}
                            >
                                {avatarInitials(profile.name)}
                            </div>

                            <div className="flex items-center gap-2">
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
                            <div className="flex items-center gap-2">
                                <h2 className="font-bold text-lg">
                                    @{profile.name}
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
                            {profile.about && (
                                <p className="text-sm ui-text-secondary leading-relaxed whitespace-pre-wrap">
                                    {profile.about}
                                </p>
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
