import React, { useEffect, useMemo, useState } from "react";
import {
    Bookmark,
    MessageCircle,
    MoreHorizontal,
    Plus,
    Repeat2,
    Share2,
    ShieldAlert,
    Trash2,
} from "lucide-react";
import Markdown from "../markdown-react";
import { expandMeta } from "../api";
import { useApp } from "../app-context";
import { BRAND, REACTION_BY_ID } from "../brand";
import { bucketImageUrl } from "../env";
import { navigate } from "../router";
import { ApiResult, Post, PostMeta } from "../types";
import { avatarGradient, avatarInitials, formatRelativeTime } from "../utils";

type PostCardProps = {
    post: Post;
    inThread?: boolean;
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

export const PostCard: React.FC<PostCardProps> = ({
    post: initialPost,
    inThread = false,
    onDeleted,
}) => {
    const { api, user, appInfo, refreshUser, openLightbox, bumpFeed, toast } =
        useApp();
    const [post, setPost] = useState<Post>(initialPost);
    const [menuOpen, setMenuOpen] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [quotedPost, setQuotedPost] = useState<Post | null>(null);
    const [reposting, setReposting] = useState(false);

    useEffect(() => {
        setPost(initialPost);
    }, [initialPost]);

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
            const res = await api.add_post("", [], [], [], [ext]);
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

    const processedBody = useMemo(
        () => linkifySocialTokens(post.body || ""),
        [post.body],
    );

    const activeReactions = Object.entries(post.reactions || {}).filter(
        ([id, users]) => REACTION_BY_ID[Number(id)] && users.length > 0,
    );

    return (
        <article
            className={`px-4 py-4 border-b ui-border transition ${inThread ? "" : "ui-hover"}`}
        >
            <div className="flex gap-3">
                {/* Avatar */}
                <button
                    type="button"
                    onClick={() => navigate(`/user/${authorName}`)}
                    className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-xs text-white cursor-pointer"
                    style={{ background: avatarGradient(authorName) }}
                    title={`@${authorName}`}
                >
                    {avatarInitials(authorName)}
                </button>

                {/* Body Column */}
                <div className="flex-1 min-w-0 space-y-2.5">
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 text-sm">
                            <button
                                type="button"
                                onClick={() => navigate(`/user/${authorName}`)}
                                className="font-semibold ui-text hover:underline cursor-pointer"
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

                        {/* More / Admin Menu */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setMenuOpen((o) => !o)}
                                className="p-1 rounded-full ui-hover ui-text-muted cursor-pointer"
                                aria-label="Post options"
                            >
                                <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 mt-1 w-48 rounded-xl border ui-border-strong ui-surface shadow-xl py-1 z-20 text-xs">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleShare();
                                            setMenuOpen(false);
                                        }}
                                        className="w-full text-left px-3 py-2 ui-hover ui-text cursor-pointer"
                                    >
                                        Copy post link
                                    </button>
                                    {(isAuthor || isAdmin) && (
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
                                    )}
                                    {isAdmin && !isAuthor && (
                                        <>
                                            <div className="my-1 border-t ui-border" />
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
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

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
                                        if (resolved.startsWith("/blob/")) {
                                            const blobId = resolved.slice(6);
                                            resolved =
                                                blobUrlMap[blobId] || resolved;
                                        }
                                        return (
                                            <img
                                                src={resolved}
                                                alt={alt || "Post image"}
                                                loading="lazy"
                                                onClick={() =>
                                                    openLightbox(resolved, alt)
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
                                        const target = href || "#";
                                        const external =
                                            target.startsWith("http");
                                        return (
                                            <a
                                                href={target}
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

                    {/* Poll Card */}
                    {poll && (
                        <div className="rounded-2xl border ui-border ui-surface p-3.5 space-y-2">
                            {poll.options.map((label, idx) => {
                                const count = (poll.votes?.[idx] || []).length;
                                const pct = totalVotes
                                    ? Math.round((count / totalVotes) * 100)
                                    : 0;
                                const voted = myVoteIndex === idx;
                                const showResults =
                                    myVoteIndex !== null || !user;
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleVotePoll(idx)}
                                        className="relative w-full text-left rounded-xl border px-3 py-2 text-xs overflow-hidden transition cursor-pointer ui-hover"
                                        style={{
                                            borderColor: voted
                                                ? "var(--ui-accent)"
                                                : "var(--ui-border)",
                                        }}
                                    >
                                        {showResults && (
                                            <div
                                                className="absolute inset-y-0 left-0 transition-all duration-300"
                                                style={{
                                                    width: `${pct}%`,
                                                    backgroundColor:
                                                        "var(--ui-accent-soft)",
                                                }}
                                            />
                                        )}
                                        <div className="relative flex items-center justify-between gap-2">
                                            <span
                                                className={`ui-text ${voted ? "font-semibold" : ""}`}
                                            >
                                                {voted ? "✓ " : ""}
                                                {label}
                                            </span>
                                            {showResults && (
                                                <span className="font-mono ui-text-secondary shrink-0">
                                                    {pct}%
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                            <div className="text-xs ui-text-muted pt-0.5">
                                {totalVotes}{" "}
                                {totalVotes === 1 ? "vote" : "votes"}
                            </div>
                        </div>
                    )}

                    {/* Quoted Repost */}
                    {quotedPost && (
                        <div
                            onClick={() => navigate(`/post/${quotedPost.id}`)}
                            className="rounded-2xl border ui-border ui-surface p-3 space-y-1 text-xs cursor-pointer ui-hover transition"
                        >
                            <div className="flex items-center gap-1.5">
                                <span className="font-semibold ui-text">
                                    @{quotedPost.meta?.author_name}
                                </span>
                                <span className="ui-text-muted">
                                    ·{" "}
                                    {formatRelativeTime(
                                        Number(quotedPost.timestamp),
                                    )}
                                </span>
                            </div>
                            <p className="ui-text-secondary leading-relaxed line-clamp-4">
                                {quotedPost.body}
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

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setEmojiOpen((o) => !o)}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-full border ui-border ui-surface ui-text-muted ui-hover cursor-pointer"
                                title="Add reaction"
                            >
                                <Plus className="w-3.5 h-3.5" />
                            </button>
                            {emojiOpen && (
                                <div className="absolute left-0 bottom-9 flex items-center gap-1 px-2 py-1.5 rounded-full border ui-border-strong ui-surface shadow-xl z-20">
                                    {BRAND.reactions.map((r) => (
                                        <button
                                            key={r.id}
                                            type="button"
                                            onClick={() => handleReact(r.id)}
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
                            onClick={() => navigate(`/post/${post.id}`)}
                            className="flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-full ui-hover transition cursor-pointer"
                            title="Replies"
                        >
                            <MessageCircle className="w-4 h-4" />
                            <span className="tabular-nums">
                                {post.tree_size || post.children?.length || 0}
                            </span>
                        </button>

                        <button
                            type="button"
                            disabled={reposting}
                            onClick={handleQuickRepost}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-full ui-hover transition cursor-pointer disabled:opacity-50"
                            title="Repost"
                        >
                            <Repeat2 className="w-4 h-4" />
                            <span className="tabular-nums">
                                {post.reposts?.length || 0}
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={handleToggleBookmark}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded-full ui-hover transition cursor-pointer ${isBookmarked ? "ui-accent-text" : ""}`}
                            title="Bookmark"
                        >
                            <Bookmark
                                className="w-4 h-4"
                                fill={isBookmarked ? "currentColor" : "none"}
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
    );
};
