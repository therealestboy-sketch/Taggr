import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Ban,
    Bell,
    BellOff,
    Bookmark,
    Check,
    EyeOff,
    Image as ImageIcon,
    Loader2,
    MessageCircle,
    MoreHorizontal,
    Pencil,
    Pin,
    Play,
    Plus,
    Quote,
    Repeat2,
    Share2,
    ShieldAlert,
    Trash2,
    X,
} from "lucide-react";
import Markdown from "../markdown-react";
import { expandMeta } from "../api";
import { useApp } from "../app-context";
import { BRAND, REACTION_BY_ID } from "../brand";
import { bucketImageUrl } from "../env";
import { navigate } from "../router";
import { ApiResult, Post, PostMeta } from "../types";
import {
    compressImageFile,
    extractBlobImages,
    extractYouTubeIds,
    formatPollTimeRemaining,
    formatRelativeTime,
} from "../utils";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";

type PostCardProps = {
    post: Post;
    inThread?: boolean;
    pinned?: boolean;
    showThreadLine?: boolean;
    onDeleted?: (postId: number) => void;
};

/**
 * Turns bare #hashtags and @mentions in markdown text into hash-route links
 * while avoiding code blocks and existing markdown links.
 */
function linkifySocialTokens(body: string): string {
    return body
        .replace(/(^|[\s(])#([a-zA-Z0-9_]{1,30})\b/g, "$1[#$2](#/tag/$2)")
        .replace(/(^|[\s(])@([a-zA-Z0-9_-]{2,20})\b/g, "$1[@$2](#/user/$2)");
}

const YouTubeEmbed: React.FC<{ videoId: string }> = ({ videoId }) => {
    const [playing, setPlaying] = useState(false);

    if (playing) {
        return (
            <div
                className="relative w-full aspect-video rounded-2xl overflow-hidden border ui-border bg-black"
                onClick={(e) => e.stopPropagation()}
            >
                <iframe
                    src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
                    title="YouTube video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                />
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                setPlaying(true);
            }}
            className="group relative block w-full aspect-video rounded-2xl overflow-hidden border ui-border bg-black cursor-pointer text-left"
            aria-label="Play YouTube video"
        >
            <img
                src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
                alt="YouTube video thumbnail"
                loading="lazy"
                className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-[1.01] transition duration-200"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent flex items-center justify-center">
                <span className="w-14 h-14 rounded-full bg-black/75 group-hover:bg-[var(--ui-accent)] text-white flex items-center justify-center shadow-xl backdrop-blur-sm transition">
                    <Play className="w-6 h-6 fill-current ml-0.5" />
                </span>
            </div>
            <span className="absolute bottom-2.5 left-3 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-medium backdrop-blur-sm">
                YouTube
            </span>
        </button>
    );
};

export const PostCard: React.FC<PostCardProps> = ({
    post: initialPost,
    inThread = false,
    pinned = false,
    showThreadLine = false,
    onDeleted,
}) => {
    const {
        api,
        user,
        appInfo,
        spaces,
        usersData,
        refreshUser,
        openLightbox,
        bumpFeed,
        toast,
    } = useApp();
    const [post, setPost] = useState<Post>(initialPost);
    const [menuOpen, setMenuOpen] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [repostMenuOpen, setRepostMenuOpen] = useState(false);
    const [quoteModalOpen, setQuoteModalOpen] = useState(false);
    const [replyModalOpen, setReplyModalOpen] = useState(false);
    const [quotedPost, setQuotedPost] = useState<Post | null>(null);
    const [reposting, setReposting] = useState(false);

    // Inline post editing state
    const [editing, setEditing] = useState(false);
    const [editBody, setEditBody] = useState(initialPost.body);
    const [editSpace, setEditSpace] = useState(initialPost.realm || "");
    const [editNewRefs, setEditNewRefs] = useState<
        { blobId: string; offset: number; len: number }[]
    >([]);
    const [editUploading, setEditUploading] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const editFileInputRef = useRef<HTMLInputElement | null>(null);

    const menuRef = useRef<HTMLDivElement | null>(null);
    const emojiRef = useRef<HTMLDivElement | null>(null);
    const repostRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setPost(initialPost);
        if (!editing) {
            setEditBody(initialPost.body);
            setEditSpace(initialPost.realm || "");
        }
    }, [initialPost, editing]);

    // Click-outside handler to close popovers cleanly
    useEffect(() => {
        if (!menuOpen && !emojiOpen && !repostMenuOpen) return;
        const onPointerDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                menuOpen &&
                menuRef.current &&
                !menuRef.current.contains(target)
            ) {
                setMenuOpen(false);
            }
            if (
                emojiOpen &&
                emojiRef.current &&
                !emojiRef.current.contains(target)
            ) {
                setEmojiOpen(false);
            }
            if (
                repostMenuOpen &&
                repostRef.current &&
                !repostRef.current.contains(target)
            ) {
                setRepostMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [menuOpen, emojiOpen, repostMenuOpen]);

    // Escape closes inline modals
    useEffect(() => {
        if (!quoteModalOpen && !replyModalOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setQuoteModalOpen(false);
                setReplyModalOpen(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [quoteModalOpen, replyModalOpen]);

    const repostTargetId =
        post.extension &&
        typeof post.extension === "object" &&
        "Repost" in post.extension
            ? post.extension.Repost
            : null;

    useEffect(() => {
        if (repostTargetId === null) {
            setQuotedPost(null);
            return;
        }
        let cancelled = false;
        api.query<[Post, PostMeta][]>("posts", [repostTargetId]).then((res) => {
            if (!cancelled && res && res.length > 0) {
                setQuotedPost(expandMeta(res[0]));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [api, repostTargetId]);

    // Map blobId -> bucket image URL
    const blobUrlMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const [key, [offset, len]] of Object.entries(post.files || {})) {
            const [blobId, bucketId] = key.split("@");
            if (blobId && bucketId) {
                map[blobId] = bucketImageUrl(bucketId, offset, len);
            }
        }
        return map;
    }, [post.files]);

    const authorName = post.meta?.author_name || `user_${post.user}`;
    const isAuthor = user?.id === post.user;
    const isAdmin = Boolean(appInfo?.is_admin);
    const isBookmarked = Boolean(user?.bookmarks?.includes(post.id));
    const isPinned = Boolean(user?.pinned_posts?.includes(post.id));
    const isWatching = Boolean(user && post.watchers?.includes(user.id));
    const isBlocked = Boolean(user?.blacklist?.includes(post.user));
    const isEdited = (post.patches?.length || 0) > 0;

    const poll =
        post.extension &&
        typeof post.extension === "object" &&
        "Poll" in post.extension
            ? post.extension.Poll
            : null;

    const myVoteIndex = useMemo(() => {
        if (!poll || !user) return null;
        for (const [optIdx, voters] of Object.entries(poll.votes || {})) {
            if (voters.includes(user.id)) return Number(optIdx);
        }
        return null;
    }, [poll, user]);

    const totalVotes = useMemo(() => {
        if (!poll) return 0;
        return Object.values(poll.votes || {}).reduce(
            (sum, list) => sum + list.length,
            0,
        );
    }, [poll]);

    const leadingVotes = useMemo(() => {
        if (!poll) return 0;
        return Math.max(
            0,
            ...poll.options.map((_, idx) => (poll.votes?.[idx] || []).length),
        );
    }, [poll]);

    const pollStatus = useMemo(() => {
        if (!poll) return null;
        return formatPollTimeRemaining(Number(post.timestamp), poll.deadline);
    }, [poll, post.timestamp]);

    const { textWithoutImages, images } = useMemo(
        () => extractBlobImages(post.body || "", blobUrlMap),
        [post.body, blobUrlMap],
    );

    const youtubeIds = useMemo(
        () => extractYouTubeIds(textWithoutImages),
        [textWithoutImages],
    );

    const processedBody = useMemo(
        () => linkifySocialTokens(textWithoutImages),
        [textWithoutImages],
    );

    const handleCardClick = (e: React.MouseEvent<HTMLElement>) => {
        if (inThread || editing) return;
        const target = e.target as HTMLElement | null;
        if (
            target?.closest(
                "a, button, input, textarea, select, img, iframe, video, [data-no-card-nav]",
            )
        ) {
            return;
        }
        const selection = window.getSelection()?.toString();
        if (selection && selection.length > 0) return;
        navigate(`/post/${post.id}`);
    };

    const handleReact = async (reactionId: number) => {
        if (!user) {
            toast("Sign in to react to posts", "error");
            return;
        }
        setEmojiOpen(false);
        const res = await api.call<ApiResult<null>>(
            "react",
            post.id,
            reactionId,
        );
        if (!res) {
            toast("Could not update reaction", "error");
            return;
        }
        if ("Err" in res) {
            toast(res.Err, "error");
            return;
        }
        setPost((prev) => {
            const nextReactions = { ...prev.reactions };
            const current = new Set(nextReactions[reactionId] || []);
            if (current.has(user.id)) {
                current.delete(user.id);
            } else {
                current.add(user.id);
            }
            if (current.size === 0) {
                delete nextReactions[reactionId];
            } else {
                nextReactions[reactionId] = Array.from(current);
            }
            return { ...prev, reactions: nextReactions };
        });
    };

    const handleVotePoll = async (optionIdx: number) => {
        if (!user) {
            toast("Sign in to vote in polls", "error");
            return;
        }
        const res = await api.call<ApiResult<null>>(
            "vote_on_poll",
            post.id,
            optionIdx,
            false,
        );
        if (!res) {
            toast("Vote failed", "error");
            return;
        }
        if ("Err" in res) {
            toast(res.Err, "error");
            return;
        }
        const updated = await api.query<[Post, PostMeta][]>("posts", [post.id]);
        if (updated && updated.length > 0) {
            setPost(expandMeta(updated[0]));
        }
        toast("Vote recorded");
    };

    const handleToggleBookmark = async () => {
        if (!user) {
            toast("Sign in to save bookmarks", "error");
            return;
        }
        const res = await api.call<ApiResult<boolean>>(
            "toggle_bookmark",
            post.id,
        );
        if (res && "Ok" in res) {
            await refreshUser();
            toast(res.Ok ? "Saved to Bookmarks" : "Removed from Bookmarks");
        }
    };

    const handleQuickRepost = async () => {
        setRepostMenuOpen(false);
        if (!user) {
            toast("Sign in to repost", "error");
            return;
        }
        if (reposting) return;
        setReposting(true);
        try {
            const ext = new TextEncoder().encode(
                JSON.stringify({ Repost: post.id }),
            );
            // Single space satisfies Post::valid non-empty body check while rendering as a pure repost
            const res = await api.add_post(" ", [], [], [], [ext]);
            if (res && "Ok" in res && res.Ok !== undefined) {
                toast("Reposted to your followers");
                bumpFeed();
            } else if (res && res.Err) {
                toast(res.Err, "error");
            }
        } finally {
            setReposting(false);
        }
    };

    const handleStartEdit = () => {
        setMenuOpen(false);
        setEditBody(post.body);
        setEditSpace(post.realm || "");
        setEditNewRefs([]);
        setEditing(true);
    };

    const handleEditImageUpload = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!appInfo?.media_bucket) {
            toast("Shared media storage is not configured yet.", "error");
            return;
        }
        setEditUploading(true);
        try {
            const maxBytes = appInfo.max_blob_size_bytes || 512 * 1024;
            const bytes = await compressImageFile(file, maxBytes);
            const res = await api.upload_media(bytes);
            if (!res) {
                toast("Image upload failed", "error");
            } else if ("Err" in res && res.Err) {
                toast(res.Err, "error");
            } else if (res.Ok) {
                const [blobId, offset, len] = res.Ok;
                setEditNewRefs((prev) => [
                    ...prev,
                    { blobId, offset: Number(offset), len: Number(len) },
                ]);
                const marker = `![](/blob/${blobId})`;
                setEditBody((prev) =>
                    prev.trim() ? `${prev.trimEnd()}\n\n${marker}` : marker,
                );
                await refreshUser();
                toast("Image attached to edit");
            }
        } catch (err) {
            toast(
                err instanceof Error ? err.message : "Image upload failed",
                "error",
            );
        } finally {
            setEditUploading(false);
        }
    };

    const handleSaveEdit = async () => {
        const nextBody = editBody.trim();
        if (!nextBody) {
            toast("Post content cannot be empty.", "error");
            return;
        }
        setSavingEdit(true);
        try {
            const refs: [string, number, number][] = editNewRefs.map((r) => [
                r.blobId,
                r.offset,
                r.len,
            ]);
            const spaceArg =
                post.parent === undefined && editSpace ? [editSpace] : [];
            const res = await api.edit_post(
                post.id,
                nextBody,
                refs,
                "",
                spaceArg,
            );
            if (!res) {
                toast("Could not save changes.", "error");
                return;
            }
            if ("Err" in res && res.Err) {
                toast(res.Err, "error");
                return;
            }
            const refreshed = await api.query<[Post, PostMeta][]>("posts", [
                post.id,
            ]);
            if (refreshed && refreshed.length > 0) {
                setPost(expandMeta(refreshed[0]));
            } else {
                setPost((prev) => ({
                    ...prev,
                    body: nextBody,
                    realm: spaceArg[0],
                    patches: [...(prev.patches || []), [Date.now(), ""]],
                }));
            }
            setEditing(false);
            setEditNewRefs([]);
            toast("Post updated");
        } finally {
            setSavingEdit(false);
        }
    };

    const handleTogglePin = async () => {
        setMenuOpen(false);
        if (!user) return;
        const res = await api.call<ApiResult<null>>(
            "toggle_pinned_post",
            post.id,
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        await refreshUser();
        toast(isPinned ? "Unpinned from profile" : "Pinned to your profile");
        bumpFeed();
    };

    const handleToggleWatch = async () => {
        setMenuOpen(false);
        if (!user) {
            toast("Sign in to follow threads", "error");
            return;
        }
        const res = await api.call<ApiResult<boolean>>(
            "toggle_following_post",
            post.id,
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        if (res && "Ok" in res) {
            setPost((prev) => {
                const set = new Set(prev.watchers || []);
                if (res.Ok) set.add(user.id);
                else set.delete(user.id);
                return { ...prev, watchers: Array.from(set) };
            });
            toast(
                res.Ok
                    ? "Watching thread for new replies"
                    : "Stopped watching thread",
            );
        }
    };

    const handleHidePost = async () => {
        setMenuOpen(false);
        if (!user) return;
        const res = await api.call<ApiResult<boolean>>(
            "toggle_hide_post",
            post.id,
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        toast("Post hidden from your feed");
        onDeleted?.(post.id);
    };

    const handleToggleBlock = async () => {
        setMenuOpen(false);
        if (!user) return;
        const res = await api.call<ApiResult<null>>(
            "toggle_blacklist",
            post.user,
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        await refreshUser();
        toast(isBlocked ? `Unmuted @${authorName}` : `Muted @${authorName}`);
        bumpFeed();
    };

    const handleDelete = async () => {
        setMenuOpen(false);
        const res = await api.call<ApiResult<null>>("delete_post", post.id, []);
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        toast(isAdmin && !isAuthor ? "Post removed by admin" : "Post deleted");
        onDeleted?.(post.id);
        bumpFeed();
    };

    const handleAdminBan = async () => {
        setMenuOpen(false);
        const res = await api.call<ApiResult<boolean>>(
            "admin_toggle_ban_user",
            post.user,
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        if (res && "Ok" in res) {
            toast(
                res.Ok ? `Suspended @${authorName}` : `Restored @${authorName}`,
            );
            bumpFeed();
        }
    };

    const handleShare = () => {
        const url = `${window.location.origin}/#/post/${post.id}`;
        navigator.clipboard?.writeText(url).catch(() => {});
        toast("Post link copied");
    };

    const reactionTooltip = (userIds: number[], label: string): string => {
        const names = userIds
            .map((id) => (usersData[id] ? `@${usersData[id]}` : null))
            .filter(Boolean) as string[];
        if (names.length === 0) {
            return `${label} · ${userIds.length}`;
        }
        if (names.length <= 4) {
            return `${label}: ${names.join(", ")}`;
        }
        return `${label}: ${names.slice(0, 4).join(", ")} + ${names.length - 4} more`;
    };

    const activeReactions = Object.entries(post.reactions || {}).filter(
        ([id, users]) => REACTION_BY_ID[Number(id)] && users.length > 0,
    );

    const isPureRepost =
        repostTargetId !== null && !processedBody.trim() && images.length === 0;

    return (
        <>
            <article
                onClick={handleCardClick}
                className={`px-4 py-4 border-b ui-border transition ${
                    inThread || editing ? "" : "ui-hover cursor-pointer"
                }`}
            >
                {/* Pinned / Pure Repost Context Indicator */}
                {pinned && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium ui-text-muted mb-2 pl-12">
                        <Pin className="w-3 h-3 ui-accent-text" />
                        <span>Pinned post</span>
                    </div>
                )}
                {isPureRepost && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium ui-text-muted mb-2 pl-12">
                        <Repeat2 className="w-3.5 h-3.5" />
                        <span>
                            {post.meta?.author_display_name || `@${authorName}`}{" "}
                            reposted
                        </span>
                    </div>
                )}

                <div className="flex gap-3">
                    {/* Avatar + Optional Thread Connector */}
                    <div className="flex flex-col items-center shrink-0">
                        <Avatar
                            name={authorName}
                            avatarRef={post.meta?.author_avatar}
                            size="lg"
                            onClick={() => navigate(`/user/${authorName}`)}
                        />
                        {showThreadLine && (
                            <div className="w-0.5 flex-1 mt-2 rounded-full bg-[var(--ui-border-strong)] min-h-[20px]" />
                        )}
                    </div>

                    {/* Body Column */}
                    <div className="flex-1 min-w-0 space-y-2.5">
                        {/* Header Row */}
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-sm">
                                {post.meta?.author_display_name && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            navigate(`/user/${authorName}`)
                                        }
                                        className="font-semibold ui-text hover:underline cursor-pointer"
                                    >
                                        {post.meta.author_display_name}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() =>
                                        navigate(`/user/${authorName}`)
                                    }
                                    className={`hover:underline cursor-pointer ${
                                        post.meta?.author_display_name
                                            ? "ui-text-muted text-xs"
                                            : "font-semibold ui-text"
                                    }`}
                                >
                                    @{authorName}
                                </button>
                                <span className="ui-text-muted">·</span>
                                <button
                                    type="button"
                                    onClick={() => navigate(`/post/${post.id}`)}
                                    className="ui-text-muted text-xs hover:underline cursor-pointer"
                                >
                                    {formatRelativeTime(Number(post.timestamp))}
                                </button>
                                {isEdited && (
                                    <span
                                        className="text-[11px] ui-text-muted"
                                        title={`Edited ${post.patches.length} ${post.patches.length === 1 ? "time" : "times"}`}
                                    >
                                        (edited)
                                    </span>
                                )}
                                {post.realm && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            navigate(`/space/${post.realm}`)
                                        }
                                        className="ml-1 text-[11px] font-medium px-2 py-0.5 rounded-full ui-accent-soft hover:opacity-90 cursor-pointer"
                                    >
                                        {post.realm}
                                    </button>
                                )}
                            </div>

                            {/* More / Actions Menu */}
                            <div className="relative" ref={menuRef}>
                                <button
                                    type="button"
                                    onClick={() => setMenuOpen((o) => !o)}
                                    className="p-1 rounded-full ui-hover ui-text-muted cursor-pointer"
                                    aria-label="Post options"
                                >
                                    <MoreHorizontal className="w-4 h-4" />
                                </button>
                                {menuOpen && (
                                    <div className="absolute right-0 mt-1 w-52 rounded-xl border ui-border-strong ui-surface shadow-xl py-1 z-30 text-xs">
                                        {isAuthor && (
                                            <button
                                                type="button"
                                                onClick={handleStartEdit}
                                                className="w-full text-left px-3 py-2 ui-hover ui-text flex items-center gap-2 cursor-pointer"
                                            >
                                                <Pencil className="w-3.5 h-3.5 ui-text-muted" />
                                                <span>Edit post</span>
                                            </button>
                                        )}
                                        {isAuthor && (
                                            <button
                                                type="button"
                                                onClick={handleTogglePin}
                                                className="w-full text-left px-3 py-2 ui-hover ui-text flex items-center gap-2 cursor-pointer"
                                            >
                                                <Pin className="w-3.5 h-3.5 ui-text-muted" />
                                                <span>
                                                    {isPinned
                                                        ? "Unpin from profile"
                                                        : "Pin to profile"}
                                                </span>
                                            </button>
                                        )}
                                        {user && (
                                            <button
                                                type="button"
                                                onClick={handleToggleWatch}
                                                className="w-full text-left px-3 py-2 ui-hover ui-text flex items-center gap-2 cursor-pointer"
                                            >
                                                {isWatching ? (
                                                    <BellOff className="w-3.5 h-3.5 ui-text-muted" />
                                                ) : (
                                                    <Bell className="w-3.5 h-3.5 ui-text-muted" />
                                                )}
                                                <span>
                                                    {isWatching
                                                        ? "Unwatch thread"
                                                        : "Watch thread"}
                                                </span>
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleShare();
                                                setMenuOpen(false);
                                            }}
                                            className="w-full text-left px-3 py-2 ui-hover ui-text flex items-center gap-2 cursor-pointer"
                                        >
                                            <Share2 className="w-3.5 h-3.5 ui-text-muted" />
                                            <span>Copy post link</span>
                                        </button>

                                        {user && !isAuthor && (
                                            <>
                                                <div className="my-1 border-t ui-border" />
                                                <button
                                                    type="button"
                                                    onClick={handleHidePost}
                                                    className="w-full text-left px-3 py-2 ui-hover ui-text-secondary flex items-center gap-2 cursor-pointer"
                                                >
                                                    <EyeOff className="w-3.5 h-3.5" />
                                                    <span>Hide post</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleToggleBlock}
                                                    className="w-full text-left px-3 py-2 ui-hover ui-text-secondary flex items-center gap-2 cursor-pointer"
                                                >
                                                    <Ban className="w-3.5 h-3.5" />
                                                    <span>
                                                        {isBlocked
                                                            ? `Unmute @${authorName}`
                                                            : `Mute @${authorName}`}
                                                    </span>
                                                </button>
                                            </>
                                        )}

                                        {(isAuthor || isAdmin) && (
                                            <>
                                                <div className="my-1 border-t ui-border" />
                                                <button
                                                    type="button"
                                                    onClick={handleDelete}
                                                    className="w-full text-left px-3 py-2 ui-hover font-medium flex items-center gap-2 cursor-pointer"
                                                    style={{
                                                        color: "var(--ui-danger)",
                                                    }}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    <span>
                                                        {isAdmin && !isAuthor
                                                            ? "Delete post (admin)"
                                                            : "Delete post"}
                                                    </span>
                                                </button>
                                            </>
                                        )}
                                        {isAdmin && !isAuthor && (
                                            <button
                                                type="button"
                                                onClick={handleAdminBan}
                                                className="w-full text-left px-3 py-2 ui-hover flex items-center gap-2 cursor-pointer"
                                                style={{
                                                    color: "var(--ui-danger)",
                                                }}
                                            >
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                                <span>
                                                    Suspend @{authorName}
                                                </span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Inline Post Editor */}
                        {editing ? (
                            <div
                                className="rounded-2xl border ui-border-strong ui-surface p-3 space-y-2.5"
                                data-no-card-nav
                            >
                                <textarea
                                    rows={4}
                                    autoFocus
                                    value={editBody}
                                    onChange={(e) =>
                                        setEditBody(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                        if (
                                            (e.metaKey || e.ctrlKey) &&
                                            e.key === "Enter" &&
                                            !savingEdit
                                        ) {
                                            e.preventDefault();
                                            handleSaveEdit();
                                        }
                                        if (e.key === "Escape") {
                                            setEditing(false);
                                        }
                                    }}
                                    className="w-full bg-transparent text-sm ui-text focus:outline-none resize-y leading-relaxed"
                                />
                                <div className="flex items-center justify-between gap-2 pt-2 border-t ui-border flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <input
                                            ref={editFileInputRef}
                                            type="file"
                                            accept="image/png,image/jpeg,image/webp,image/gif"
                                            onChange={handleEditImageUpload}
                                            className="hidden"
                                        />
                                        <button
                                            type="button"
                                            disabled={editUploading}
                                            onClick={() =>
                                                editFileInputRef.current?.click()
                                            }
                                            className="p-1.5 rounded-full ui-hover ui-text-secondary cursor-pointer disabled:opacity-50"
                                            title="Attach image"
                                        >
                                            {editUploading ? (
                                                <Loader2 className="w-4 h-4 animate-spin ui-accent-text" />
                                            ) : (
                                                <ImageIcon className="w-4 h-4" />
                                            )}
                                        </button>
                                        {post.parent === undefined && (
                                            <select
                                                value={editSpace}
                                                onChange={(e) =>
                                                    setEditSpace(e.target.value)
                                                }
                                                className="rounded-full ui-pill px-2.5 py-1 text-xs ui-text-secondary focus:outline-none cursor-pointer"
                                                aria-label={`Move to ${BRAND.communitySingular}`}
                                            >
                                                <option value="">
                                                    Main feed
                                                </option>
                                                {spaces
                                                    .filter(([id]) =>
                                                        user?.realms?.includes(
                                                            id,
                                                        ),
                                                    )
                                                    .map(([id]) => (
                                                        <option
                                                            key={id}
                                                            value={id}
                                                        >
                                                            {id}
                                                        </option>
                                                    ))}
                                            </select>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditing(false);
                                                setEditBody(post.body);
                                                setEditNewRefs([]);
                                            }}
                                            className="px-3 py-1 rounded-full ui-pill text-xs ui-text-secondary ui-hover cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            disabled={
                                                savingEdit ||
                                                editUploading ||
                                                !editBody.trim()
                                            }
                                            onClick={handleSaveEdit}
                                            className="px-3.5 py-1 rounded-full ui-accent-bg text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                        >
                                            {savingEdit ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Check className="w-3.5 h-3.5" />
                                            )}
                                            <span>Save</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Markdown Body */}
                                {processedBody.trim() && (
                                    <div className="post-markdown text-[14.5px] leading-relaxed ui-text break-words">
                                        <Markdown
                                            components={{
                                                img: ({
                                                    src,
                                                    alt,
                                                }: {
                                                    src?: string;
                                                    alt?: string;
                                                }) => {
                                                    let resolved = src || "";
                                                    if (
                                                        resolved.startsWith(
                                                            "/blob/",
                                                        )
                                                    ) {
                                                        const blobId =
                                                            resolved.slice(6);
                                                        resolved =
                                                            blobUrlMap[
                                                                blobId
                                                            ] || resolved;
                                                    }
                                                    return (
                                                        <img
                                                            src={resolved}
                                                            alt={
                                                                alt ||
                                                                "Post image"
                                                            }
                                                            loading="lazy"
                                                            onClick={() =>
                                                                openLightbox(
                                                                    resolved,
                                                                    alt,
                                                                )
                                                            }
                                                            className="mt-2 rounded-2xl border ui-border max-h-[420px] w-auto object-cover cursor-pointer hover:opacity-95 transition"
                                                        />
                                                    );
                                                },
                                                a: ({
                                                    href,
                                                    children,
                                                }: {
                                                    href?: string;
                                                    children?: React.ReactNode;
                                                }) => {
                                                    const external = Boolean(
                                                        href &&
                                                            (href.startsWith(
                                                                "http://",
                                                            ) ||
                                                                href.startsWith(
                                                                    "https://",
                                                                )),
                                                    );
                                                    return (
                                                        <a
                                                            href={href}
                                                            target={
                                                                external
                                                                    ? "_blank"
                                                                    : undefined
                                                            }
                                                            rel={
                                                                external
                                                                    ? "noopener noreferrer"
                                                                    : undefined
                                                            }
                                                            className="ui-accent-text hover:underline"
                                                        >
                                                            {children}
                                                        </a>
                                                    );
                                                },
                                            }}
                                        >
                                            {processedBody}
                                        </Markdown>
                                    </div>
                                )}

                                {/* Multi-Image Gallery Grid */}
                                {images.length === 1 && (
                                    <div className="pt-0.5">
                                        <img
                                            src={images[0].src}
                                            alt={images[0].alt}
                                            loading="lazy"
                                            onClick={() =>
                                                openLightbox(
                                                    images[0].src,
                                                    images[0].alt,
                                                )
                                            }
                                            className="rounded-2xl border ui-border max-h-[460px] max-w-full w-auto object-cover cursor-pointer hover:opacity-95 transition"
                                        />
                                    </div>
                                )}
                                {images.length > 1 && (
                                    <div
                                        className={`grid gap-1.5 rounded-2xl overflow-hidden border ui-border pt-0 ${
                                            images.length === 2
                                                ? "grid-cols-2"
                                                : "grid-cols-2"
                                        }`}
                                    >
                                        {images.slice(0, 4).map((img, idx) => {
                                            const spanTwo =
                                                images.length === 3 &&
                                                idx === 0;
                                            return (
                                                <div
                                                    key={`${img.blobId}-${idx}`}
                                                    className={`relative overflow-hidden bg-black/20 ${
                                                        spanTwo
                                                            ? "row-span-2 h-full min-h-[240px]"
                                                            : images.length ===
                                                                2
                                                              ? "h-60"
                                                              : "h-40"
                                                    }`}
                                                >
                                                    <img
                                                        src={img.src}
                                                        alt={img.alt}
                                                        loading="lazy"
                                                        onClick={() =>
                                                            openLightbox(
                                                                img.src,
                                                                img.alt,
                                                            )
                                                        }
                                                        className="w-full h-full object-cover cursor-pointer hover:scale-[1.02] transition duration-200"
                                                    />
                                                    {idx === 3 &&
                                                        images.length > 4 && (
                                                            <div
                                                                onClick={() =>
                                                                    openLightbox(
                                                                        img.src,
                                                                        img.alt,
                                                                    )
                                                                }
                                                                className="absolute inset-0 bg-black/55 text-white font-bold text-lg flex items-center justify-center cursor-pointer"
                                                            >
                                                                +
                                                                {images.length -
                                                                    4}
                                                            </div>
                                                        )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* YouTube Video Embeds */}
                                {youtubeIds.length > 0 && (
                                    <div className="space-y-2 pt-0.5">
                                        {youtubeIds.map((vid) => (
                                            <YouTubeEmbed
                                                key={vid}
                                                videoId={vid}
                                            />
                                        ))}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Poll Card */}
                        {poll && (
                            <div
                                className="rounded-2xl border ui-border ui-surface p-3.5 space-y-2"
                                data-no-card-nav
                            >
                                {poll.options.map((label, idx) => {
                                    const count = (poll.votes?.[idx] || [])
                                        .length;
                                    const pct = totalVotes
                                        ? Math.round((count / totalVotes) * 100)
                                        : 0;
                                    const chosen = myVoteIndex === idx;
                                    const isLeader =
                                        totalVotes > 0 &&
                                        count === leadingVotes &&
                                        (myVoteIndex !== null ||
                                            pollStatus?.ended);
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            disabled={
                                                myVoteIndex !== null ||
                                                pollStatus?.ended
                                            }
                                            onClick={() => handleVotePoll(idx)}
                                            className={`w-full relative overflow-hidden rounded-xl border px-3 py-2 text-left text-xs transition ${
                                                chosen
                                                    ? "border-[var(--ui-accent)]"
                                                    : "ui-border"
                                            } ${
                                                myVoteIndex === null &&
                                                !pollStatus?.ended
                                                    ? "ui-hover cursor-pointer"
                                                    : "cursor-default"
                                            }`}
                                        >
                                            <div
                                                className="absolute inset-y-0 left-0 transition-all duration-300"
                                                style={{
                                                    width: `${myVoteIndex !== null || pollStatus?.ended ? pct : 0}%`,
                                                    backgroundColor:
                                                        chosen || isLeader
                                                            ? "var(--ui-accent-soft)"
                                                            : "var(--ui-pill-bg)",
                                                }}
                                            />
                                            <div className="relative flex items-center justify-between gap-2">
                                                <span
                                                    className={`flex items-center gap-1.5 ${
                                                        chosen || isLeader
                                                            ? "font-semibold ui-text"
                                                            : "ui-text-secondary"
                                                    }`}
                                                >
                                                    {chosen && (
                                                        <Check className="w-3.5 h-3.5 ui-accent-text shrink-0" />
                                                    )}
                                                    <span>{label}</span>
                                                </span>
                                                {(myVoteIndex !== null ||
                                                    pollStatus?.ended) && (
                                                    <span className="font-mono ui-text-muted shrink-0">
                                                        {pct}% ({count})
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                                <div className="flex items-center justify-between text-[11px] ui-text-muted pt-0.5">
                                    <span>
                                        {totalVotes}{" "}
                                        {totalVotes === 1 ? "vote" : "votes"}
                                    </span>
                                    <span>{pollStatus?.label}</span>
                                </div>
                            </div>
                        )}

                        {/* Embedded Quoted / Reposted Post */}
                        {quotedPost && (
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/post/${quotedPost.id}`);
                                }}
                                className="rounded-2xl border ui-border ui-surface p-3.5 space-y-1.5 ui-hover transition cursor-pointer text-xs"
                                data-no-card-nav
                            >
                                <div className="flex items-center gap-2">
                                    <Avatar
                                        name={
                                            quotedPost.meta?.author_name || "u"
                                        }
                                        avatarRef={
                                            quotedPost.meta?.author_avatar
                                        }
                                        size="xs"
                                    />
                                    {quotedPost.meta?.author_display_name && (
                                        <span className="font-semibold ui-text">
                                            {
                                                quotedPost.meta
                                                    .author_display_name
                                            }
                                        </span>
                                    )}
                                    <span className="ui-text-muted">
                                        @{quotedPost.meta?.author_name}
                                    </span>
                                    <span className="ui-text-muted">
                                        ·{" "}
                                        {formatRelativeTime(
                                            Number(quotedPost.timestamp),
                                        )}
                                    </span>
                                </div>
                                <p className="ui-text-secondary leading-relaxed line-clamp-4 whitespace-pre-wrap">
                                    {quotedPost.body
                                        .replace(
                                            /!\[[^\]]*\]\(\/blob\/[A-Za-z0-9_-]+\)/g,
                                            "[image]",
                                        )
                                        .trim()}
                                </p>
                            </div>
                        )}

                        {/* Emoji Reactions Bar */}
                        <div className="flex items-center flex-wrap gap-1.5 pt-0.5 relative">
                            {activeReactions.map(([idStr, users]) => {
                                const id = Number(idStr);
                                const info = REACTION_BY_ID[id];
                                if (!info) return null;
                                const mine = Boolean(
                                    user && users.includes(user.id),
                                );
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => handleReact(id)}
                                        title={reactionTooltip(
                                            users,
                                            info.label,
                                        )}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition cursor-pointer ${
                                            mine
                                                ? "ui-accent-soft font-semibold"
                                                : "ui-surface ui-border ui-text-secondary ui-hover"
                                        }`}
                                        style={
                                            mine
                                                ? {
                                                      borderColor:
                                                          "var(--ui-accent)",
                                                  }
                                                : undefined
                                        }
                                    >
                                        <span>{info.emoji}</span>
                                        <span className="tabular-nums">
                                            {users.length}
                                        </span>
                                    </button>
                                );
                            })}

                            <div className="relative" ref={emojiRef}>
                                <button
                                    type="button"
                                    onClick={() => setEmojiOpen((o) => !o)}
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-full border ui-border ui-surface ui-text-muted ui-hover cursor-pointer"
                                    title="Add reaction"
                                >
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                                {emojiOpen && (
                                    <div className="absolute left-0 bottom-9 flex items-center gap-1 px-2 py-1.5 rounded-full border ui-border-strong ui-surface shadow-xl z-30">
                                        {BRAND.reactions.map((r) => (
                                            <button
                                                key={r.id}
                                                type="button"
                                                onClick={() =>
                                                    handleReact(r.id)
                                                }
                                                className="w-7 h-7 rounded-full ui-hover flex items-center justify-center text-sm cursor-pointer"
                                                title={r.label}
                                            >
                                                {r.emoji}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action Row */}
                        <div className="flex items-center justify-between max-w-sm pt-1 ui-text-muted text-xs">
                            <button
                                type="button"
                                onClick={() => {
                                    if (inThread || !user) {
                                        navigate(`/post/${post.id}`);
                                    } else {
                                        setReplyModalOpen(true);
                                    }
                                }}
                                className="flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-full ui-hover transition cursor-pointer"
                                title="Reply"
                            >
                                <MessageCircle className="w-4 h-4" />
                                <span className="tabular-nums">
                                    {post.tree_size ||
                                        post.children?.length ||
                                        0}
                                </span>
                            </button>

                            <div className="relative" ref={repostRef}>
                                <button
                                    type="button"
                                    disabled={reposting}
                                    onClick={() => setRepostMenuOpen((o) => !o)}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-full ui-hover transition cursor-pointer disabled:opacity-50"
                                    title="Repost or quote"
                                >
                                    <Repeat2 className="w-4 h-4" />
                                    <span className="tabular-nums">
                                        {post.reposts?.length || 0}
                                    </span>
                                </button>
                                {repostMenuOpen && (
                                    <div className="absolute left-0 bottom-8 w-40 rounded-xl border ui-border-strong ui-surface shadow-xl py-1 z-30 text-xs">
                                        <button
                                            type="button"
                                            onClick={handleQuickRepost}
                                            className="w-full text-left px-3 py-2 ui-hover ui-text flex items-center gap-2 cursor-pointer"
                                        >
                                            <Repeat2 className="w-3.5 h-3.5 ui-text-muted" />
                                            <span>Repost</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setRepostMenuOpen(false);
                                                if (!user) {
                                                    toast(
                                                        "Sign in to quote posts",
                                                        "error",
                                                    );
                                                    return;
                                                }
                                                setQuoteModalOpen(true);
                                            }}
                                            className="w-full text-left px-3 py-2 ui-hover ui-text flex items-center gap-2 cursor-pointer"
                                        >
                                            <Quote className="w-3.5 h-3.5 ui-text-muted" />
                                            <span>Quote post</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleToggleBookmark}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-full ui-hover transition cursor-pointer ${isBookmarked ? "ui-accent-text" : ""}`}
                                title={
                                    isBookmarked
                                        ? "Remove bookmark"
                                        : "Bookmark"
                                }
                            >
                                <Bookmark
                                    className="w-4 h-4"
                                    fill={
                                        isBookmarked ? "currentColor" : "none"
                                    }
                                />
                            </button>

                            <button
                                type="button"
                                onClick={handleShare}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-full ui-hover transition cursor-pointer"
                                title="Copy link"
                            >
                                <Share2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </article>

            {/* Quick Reply Modal */}
            {replyModalOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 p-4"
                    onClick={() => setReplyModalOpen(false)}
                >
                    <div
                        className="w-full max-w-xl rounded-2xl border ui-border-strong ui-bg shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b ui-border flex items-center justify-between">
                            <span className="text-sm font-semibold ui-text">
                                Reply to @{authorName}
                            </span>
                            <button
                                type="button"
                                onClick={() => setReplyModalOpen(false)}
                                className="p-1 rounded-full ui-hover ui-text-muted cursor-pointer"
                                aria-label="Close reply modal"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="px-4 pt-3.5 pb-1 flex gap-3">
                            <div className="flex flex-col items-center shrink-0">
                                <Avatar
                                    name={authorName}
                                    avatarRef={post.meta?.author_avatar}
                                    size="md"
                                />
                                <div className="w-0.5 flex-1 mt-1.5 rounded-full bg-[var(--ui-border-strong)] min-h-[16px]" />
                            </div>
                            <div className="min-w-0 pb-2 text-xs space-y-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-semibold ui-text">
                                        {post.meta?.author_display_name ||
                                            `@${authorName}`}
                                    </span>
                                    <span className="ui-text-muted">
                                        @{authorName} ·{" "}
                                        {formatRelativeTime(
                                            Number(post.timestamp),
                                        )}
                                    </span>
                                </div>
                                <p className="ui-text-secondary line-clamp-3 whitespace-pre-wrap">
                                    {textWithoutImages || "[Image]"}
                                </p>
                            </div>
                        </div>
                        <Composer
                            parentId={post.id}
                            defaultSpace={post.realm || null}
                            placeholder={`Write your reply to @${authorName}...`}
                            compact
                            autoFocus
                            noBorder
                            onPublished={() => {
                                setReplyModalOpen(false);
                                setPost((prev) => ({
                                    ...prev,
                                    tree_size: (prev.tree_size || 0) + 1,
                                }));
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Quote Post Modal */}
            {quoteModalOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-start justify-center pt-16 sm:pt-24 p-4"
                    onClick={() => setQuoteModalOpen(false)}
                >
                    <div
                        className="w-full max-w-xl rounded-2xl border ui-border-strong ui-bg shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b ui-border flex items-center justify-between">
                            <span className="text-sm font-semibold ui-text">
                                Quote post
                            </span>
                            <button
                                type="button"
                                onClick={() => setQuoteModalOpen(false)}
                                className="p-1 rounded-full ui-hover ui-text-muted cursor-pointer"
                                aria-label="Close quote modal"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <Composer
                            repostId={post.id}
                            defaultSpace={post.realm || null}
                            placeholder="Add your thoughts..."
                            compact
                            autoFocus
                            noBorder
                            onPublished={() => {
                                setQuoteModalOpen(false);
                            }}
                        />
                        <div className="px-4 pb-4">
                            <div className="rounded-2xl border ui-border ui-surface p-3 space-y-1 text-xs">
                                <div className="flex items-center gap-1.5">
                                    <Avatar
                                        name={authorName}
                                        avatarRef={post.meta?.author_avatar}
                                        size="xs"
                                    />
                                    <span className="font-semibold ui-text">
                                        {post.meta?.author_display_name ||
                                            `@${authorName}`}
                                    </span>
                                    <span className="ui-text-muted">
                                        @{authorName} ·{" "}
                                        {formatRelativeTime(
                                            Number(post.timestamp),
                                        )}
                                    </span>
                                </div>
                                <p className="ui-text-secondary line-clamp-3 whitespace-pre-wrap">
                                    {textWithoutImages || "[Image]"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
