import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    ArrowLeft,
    Ban,
    Calendar,
    Camera,
    ExternalLink,
    Image as ImageIcon,
    Loader2,
    ShieldAlert,
    X,
} from "lucide-react";
import { expandMeta } from "../api";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { Avatar } from "../components/Avatar";
import { PostCard } from "../components/PostCard";
import { bucketImageUrl, currentDomain } from "../env";
import { navigate } from "../router";
import { ApiResult, Post, PostMeta, User, UserData } from "../types";
import {
    avatarGradient,
    compressAvatarFile,
    compressBannerFile,
    extractBlobImages,
    formatBytes,
    formatJoinedDate,
    resolveMediaRef,
} from "../utils";

type ProfileTab = "posts" | "replies" | "media";

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
    const [pinnedPosts, setPinnedPosts] = useState<Post[]>([]);
    const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
    const [loading, setLoading] = useState(true);
    const [uploadingKind, setUploadingKind] = useState<
        "avatar" | "banner" | null
    >(null);

    // Followers / Following modal state
    const [listModal, setListModal] = useState<
        "followers" | "following" | null
    >(null);
    const [listUsers, setListUsers] = useState<{ id: number; name: string }[]>(
        [],
    );
    const [listLoading, setListLoading] = useState(false);

    // Inline Edit Profile modal state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editDisplayName, setEditDisplayName] = useState("");
    const [editBio, setEditBio] = useState("");
    const [editWebsite, setEditWebsite] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);

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
            if (u?.pinned_posts && u.pinned_posts.length > 0) {
                const rawPinned = await api.query<[Post, PostMeta][]>(
                    "posts",
                    u.pinned_posts,
                );
                setPinnedPosts((rawPinned || []).map(expandMeta));
            } else {
                setPinnedPosts([]);
            }
        } finally {
            setLoading(false);
        }
    }, [api, handle]);

    useEffect(() => {
        setActiveTab("posts");
        loadProfile();
    }, [loadProfile, feedRefreshKey]);

    const isOwn = Boolean(me && profile && me.id === profile.id);
    const isFollowing = Boolean(
        me && profile && me.followees?.includes(profile.id),
    );
    const isBlocked = Boolean(
        me && profile && me.blacklist?.includes(profile.id),
    );

    const handleOpenListModal = async (kind: "followers" | "following") => {
        if (!profile) return;
        setListModal(kind);
        const ids =
            kind === "followers"
                ? profile.followers || []
                : profile.followees || [];
        if (ids.length === 0) {
            setListUsers([]);
            return;
        }
        setListLoading(true);
        try {
            const map = await api.query<UserData>("users_data", ids);
            const entries = ids
                .map((id) => ({
                    id,
                    name: map?.[id] || `user_${id}`,
                }))
                .filter((x) => Boolean(x.name));
            setListUsers(entries);
        } finally {
            setListLoading(false);
        }
    };

    const handleOpenEditProfile = () => {
        if (!profile) return;
        setEditDisplayName(profile.settings?.display_name || "");
        setEditBio(profile.about || "");
        setEditWebsite(profile.settings?.website || "");
        setEditModalOpen(true);
    };

    const handleSaveEditProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!me) return;
        setSavingProfile(true);
        try {
            const nextSettings: { [k: string]: string } = {
                ...(me.settings || {}),
            };
            const cleanDisplay = editDisplayName.trim().slice(0, 50);
            if (cleanDisplay) nextSettings.display_name = cleanDisplay;
            else delete nextSettings.display_name;

            const cleanWeb = editWebsite.trim().slice(0, 200);
            if (cleanWeb) {
                if (
                    !cleanWeb.startsWith("https://") &&
                    !cleanWeb.startsWith("http://")
                ) {
                    toast(
                        "Website URL must start with https:// or http://",
                        "error",
                    );
                    setSavingProfile(false);
                    return;
                }
                nextSettings.website = cleanWeb;
            } else {
                delete nextSettings.website;
            }

            const [settingsRes, userRes] = await Promise.all([
                api.call<ApiResult<null>>("update_user_settings", nextSettings),
                api.call<ApiResult<null>>(
                    "update_user",
                    null,
                    editBio.trim(),
                    [],
                    false,
                    "Rewards",
                    false,
                ),
            ]);
            if (settingsRes && "Err" in settingsRes) {
                toast(settingsRes.Err, "error");
                return;
            }
            if (userRes && "Err" in userRes) {
                toast(userRes.Err, "error");
                return;
            }
            await Promise.all([refreshUser(), loadProfile()]);
            bumpFeed();
            setEditModalOpen(false);
            toast("Profile updated");
        } finally {
            setSavingProfile(false);
        }
    };

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

    const handleToggleMute = async () => {
        if (!profile || !me) return;
        const res = await api.call<ApiResult<null>>(
            "toggle_blacklist",
            profile.id,
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        await refreshUser();
        toast(
            isBlocked ? `Unmuted @${profile.name}` : `Muted @${profile.name}`,
        );
        bumpFeed();
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

    const pinnedIds = useMemo(
        () => new Set(pinnedPosts.map((p) => p.id)),
        [pinnedPosts],
    );
    const topLevelPosts = useMemo(
        () =>
            posts.filter((p) => p.parent === undefined && !pinnedIds.has(p.id)),
        [posts, pinnedIds],
    );
    const replyPosts = useMemo(
        () => posts.filter((p) => p.parent !== undefined),
        [posts],
    );
    const mediaItems = useMemo(() => {
        const items: { postId: number; src: string; alt: string }[] = [];
        for (const p of posts) {
            const map: Record<string, string> = {};
            for (const [key, [offset, len]] of Object.entries(p.files || {})) {
                const [blobId, bucketId] = key.split("@");
                if (blobId && bucketId) {
                    map[blobId] = bucketImageUrl(bucketId, offset, len);
                }
            }
            const { images } = extractBlobImages(p.body || "", map);
            for (const img of images) {
                items.push({ postId: p.id, src: img.src, alt: img.alt });
            }
        }
        return items;
    }, [posts]);

    const bannerUrl = resolveMediaRef(profile?.settings?.banner);
    const avatarUrl = resolveMediaRef(profile?.settings?.avatar);
    const displayName = profile?.settings?.display_name?.trim();
    const website = profile?.settings?.website?.trim();
    const safeWebsite =
        website &&
        (website.startsWith("https://") || website.startsWith("http://"))
            ? website
            : null;
    const joinedText = profile
        ? formatJoinedDate(Number(profile.timestamp))
        : "";

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
                    <div className="px-4 pb-4 space-y-4">
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
                                        onClick={handleOpenEditProfile}
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
                                        {me && (
                                            <button
                                                type="button"
                                                onClick={handleToggleMute}
                                                className="p-1.5 rounded-full border ui-border-strong ui-text-secondary ui-hover cursor-pointer"
                                                title={
                                                    isBlocked
                                                        ? `Unmute @${profile.name}`
                                                        : `Mute @${profile.name}`
                                                }
                                            >
                                                <Ban className="w-3.5 h-3.5" />
                                            </button>
                                        )}
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
                            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 pt-0.5 text-xs ui-text-muted">
                                {safeWebsite && (
                                    <a
                                        href={safeWebsite}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 ui-accent-text hover:underline"
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
                                {joinedText && (
                                    <span className="inline-flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        <span>{joinedText}</span>
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center flex-wrap gap-4 text-xs">
                            <button
                                type="button"
                                onClick={() => handleOpenListModal("following")}
                                className="hover:underline cursor-pointer"
                            >
                                <strong className="ui-text">
                                    {profile.followees?.length || 0}
                                </strong>{" "}
                                <span className="ui-text-muted">Following</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleOpenListModal("followers")}
                                className="hover:underline cursor-pointer"
                            >
                                <strong className="ui-text">
                                    {profile.followers?.length || 0}
                                </strong>{" "}
                                <span className="ui-text-muted">Followers</span>
                            </button>
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

                    {/* Profile Content Tabs */}
                    <div className="grid grid-cols-3 border-y ui-border text-xs sm:text-sm font-medium">
                        {(
                            [
                                {
                                    id: "posts",
                                    label: "Posts",
                                    count:
                                        topLevelPosts.length +
                                        pinnedPosts.length,
                                },
                                {
                                    id: "replies",
                                    label: "Replies",
                                    count: replyPosts.length,
                                },
                                {
                                    id: "media",
                                    label: "Media",
                                    count: mediaItems.length,
                                },
                            ] as const
                        ).map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setActiveTab(t.id)}
                                className={`py-3 text-center relative ui-hover transition cursor-pointer ${
                                    activeTab === t.id
                                        ? "ui-text font-semibold"
                                        : "ui-text-muted"
                                }`}
                            >
                                <span>{t.label}</span>
                                {t.count > 0 && (
                                    <span className="ml-1.5 text-[11px] ui-text-muted tabular-nums">
                                        {t.count}
                                    </span>
                                )}
                                {activeTab === t.id && (
                                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full ui-accent-bg" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Tab Body */}
                    {activeTab === "posts" && (
                        <>
                            {pinnedPosts.map((p) => (
                                <PostCard
                                    key={`pinned-${p.id}`}
                                    post={p}
                                    pinned
                                    onDeleted={(id) => {
                                        setPinnedPosts((prev) =>
                                            prev.filter((x) => x.id !== id),
                                        );
                                        setPosts((prev) =>
                                            prev.filter((x) => x.id !== id),
                                        );
                                    }}
                                />
                            ))}
                            {topLevelPosts.length === 0 &&
                            pinnedPosts.length === 0 ? (
                                <div className="py-12 text-center text-sm ui-text-muted">
                                    No posts yet.
                                </div>
                            ) : (
                                topLevelPosts.map((p) => (
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

                    {activeTab === "replies" &&
                        (replyPosts.length === 0 ? (
                            <div className="py-12 text-center text-sm ui-text-muted">
                                No replies yet.
                            </div>
                        ) : (
                            replyPosts.map((p) => (
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
                        ))}

                    {activeTab === "media" &&
                        (mediaItems.length === 0 ? (
                            <div className="py-14 text-center space-y-2">
                                <ImageIcon className="w-6 h-6 mx-auto ui-text-muted opacity-60" />
                                <p className="text-sm ui-text-muted">
                                    No photos posted yet.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-1 p-1">
                                {mediaItems.map((item, idx) => (
                                    <button
                                        key={`${item.postId}-${idx}`}
                                        type="button"
                                        onClick={() =>
                                            openLightbox(item.src, item.alt)
                                        }
                                        className="group relative aspect-square overflow-hidden rounded-lg ui-surface cursor-pointer"
                                    >
                                        <img
                                            src={item.src}
                                            alt={item.alt}
                                            loading="lazy"
                                            className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                                        />
                                    </button>
                                ))}
                            </div>
                        ))}
                </>
            )}

            {/* Followers / Following Modal */}
            {listModal && profile && (
                <div
                    className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setListModal(null)}
                >
                    <div
                        className="w-full max-w-sm max-h-[75vh] flex flex-col rounded-2xl border ui-border-strong ui-surface shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b ui-border flex items-center justify-between">
                            <h2 className="font-bold text-sm">
                                {listModal === "followers"
                                    ? `Followers of @${profile.name}`
                                    : `@${profile.name} is following`}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setListModal(null)}
                                className="p-1 rounded-full ui-hover ui-text-muted cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="overflow-y-auto divide-y ui-border">
                            {listLoading ? (
                                <div className="py-10 flex justify-center">
                                    <Loader2 className="w-5 h-5 animate-spin ui-text-muted" />
                                </div>
                            ) : listUsers.length === 0 ? (
                                <div className="py-10 text-center text-xs ui-text-muted">
                                    {listModal === "followers"
                                        ? "No followers yet."
                                        : "Not following anyone yet."}
                                </div>
                            ) : (
                                listUsers.map((u) => (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => {
                                            setListModal(null);
                                            navigate(`/user/${u.name}`);
                                        }}
                                        className="w-full px-4 py-3 flex items-center gap-3 ui-hover text-left transition cursor-pointer"
                                    >
                                        <Avatar name={u.name} size="sm" />
                                        <span className="text-sm font-medium ui-text truncate">
                                            @{u.name}
                                        </span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Inline Edit Profile Modal */}
            {editModalOpen && isOwn && (
                <div
                    className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setEditModalOpen(false)}
                >
                    <form
                        onSubmit={handleSaveEditProfile}
                        onClick={(e) => e.stopPropagation()}
                        toolname="quick_edit_profile"
                        tooldescription="Update the signed-in user's display name, bio, and website URL from their profile page."
                        className="w-full max-w-md rounded-2xl border ui-border-strong ui-surface p-6 shadow-2xl space-y-4"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-base">
                                Edit profile
                            </h2>
                            <button
                                type="button"
                                onClick={() => setEditModalOpen(false)}
                                className="p-1 rounded-full ui-hover ui-text-muted cursor-pointer"
                                aria-label="Close edit profile modal"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium ui-text-secondary">
                                Display name
                            </label>
                            <input
                                type="text"
                                name="display_name"
                                toolparamdescription="Public display name shown on profile and posts."
                                maxLength={50}
                                value={editDisplayName}
                                onChange={(e) =>
                                    setEditDisplayName(e.target.value)
                                }
                                placeholder="Your name"
                                className="w-full rounded-xl ui-surface-2 border ui-border px-3 py-2 text-sm ui-text focus:outline-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium ui-text-secondary">
                                Bio
                            </label>
                            <textarea
                                name="bio"
                                toolparamdescription="Short public biography shown on your profile."
                                rows={3}
                                value={editBio}
                                onChange={(e) => setEditBio(e.target.value)}
                                placeholder="Tell people a bit about yourself..."
                                className="w-full rounded-xl ui-surface-2 border ui-border px-3 py-2 text-sm ui-text focus:outline-none resize-none"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-medium ui-text-secondary">
                                Website
                            </label>
                            <input
                                type="url"
                                name="website"
                                toolparamdescription="Personal website URL starting with https:// or http://."
                                maxLength={200}
                                value={editWebsite}
                                onChange={(e) => setEditWebsite(e.target.value)}
                                placeholder="https://example.com"
                                className="w-full rounded-xl ui-surface-2 border ui-border px-3 py-2 text-sm ui-text focus:outline-none"
                            />
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setEditModalOpen(false);
                                    navigate("/settings");
                                }}
                                className="text-xs ui-accent-text hover:underline cursor-pointer"
                            >
                                Full account settings →
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditModalOpen(false)}
                                    className="px-4 py-2 rounded-full ui-pill text-xs ui-text-secondary ui-hover cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingProfile}
                                    className="px-4 py-2 rounded-full ui-accent-bg text-xs font-semibold disabled:opacity-50 cursor-pointer"
                                >
                                    {savingProfile ? "Saving..." : "Save"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
