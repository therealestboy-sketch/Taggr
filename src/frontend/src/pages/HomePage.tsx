import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ArrowLeft,
    ArrowUp,
    Clock,
    Flame,
    Loader2,
    Pencil,
    X,
} from "lucide-react";
import { expandMeta } from "../api";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { Composer } from "../components/Composer";
import { PostCard } from "../components/PostCard";
import { currentDomain } from "../env";
import { navigate } from "../router";
import { ApiResult, Post, PostMeta } from "../types";
import { spaceBadgeStyle } from "../utils";

type HomePageProps = {
    spaceId?: string;
    tag?: string;
};

const SPACE_COLOURS = [
    "#3b82f6",
    "#6366f1",
    "#8b5cf6",
    "#ec4899",
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#0ea5e9",
];

export const HomePage: React.FC<HomePageProps> = ({ spaceId, tag }) => {
    const {
        api,
        user,
        spaces,
        feedRefreshKey,
        refreshUser,
        refreshDiscovery,
        toast,
    } = useApp();
    const [tab, setTab] = useState<"for-you" | "following">("for-you");
    const [sort, setSort] = useState<"latest" | "hot">("latest");
    const [posts, setPosts] = useState<Post[]>([]);
    const [pendingPosts, setPendingPosts] = useState<Post[]>([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(false);

    // Edit Space modal state
    const [editSpaceOpen, setEditSpaceOpen] = useState(false);
    const [spaceDesc, setSpaceDesc] = useState("");
    const [spaceColour, setSpaceColour] = useState(BRAND.accent.main);
    const [savingSpace, setSavingSpace] = useState(false);

    const postsRef = useRef<Post[]>([]);
    postsRef.current = posts;

    const spaceInfo = spaceId
        ? spaces.find(([id]) => id === spaceId)?.[1]
        : undefined;
    const isSpaceMember = Boolean(spaceId && user?.realms?.includes(spaceId));
    const isSpaceController = Boolean(
        spaceId &&
            user &&
            (user.controlled_realms?.includes(spaceId) ||
                spaceInfo?.controllers?.includes(user.id)),
    );

    const fetchPage = useCallback(
        async (targetPage: number, append: boolean) => {
            setLoading(true);
            try {
                const host = currentDomain();
                let raw: [Post, PostMeta][] | null = null;
                if (tag) {
                    raw = await api.query<[Post, PostMeta][]>(
                        "posts_by_tags",
                        host,
                        "",
                        [tag],
                        targetPage,
                        0,
                    );
                } else if (spaceId) {
                    raw = await api.query<[Post, PostMeta][]>(
                        sort === "hot" ? "hot_posts" : "last_posts",
                        host,
                        spaceId,
                        targetPage,
                        0,
                        false,
                    );
                } else if (tab === "following" && user) {
                    raw = await api.query<[Post, PostMeta][]>(
                        "personal_feed",
                        host,
                        targetPage,
                        0,
                    );
                } else {
                    raw = await api.query<[Post, PostMeta][]>(
                        sort === "hot" ? "hot_posts" : "last_posts",
                        host,
                        "",
                        targetPage,
                        0,
                        false,
                    );
                }
                const list = (raw || []).map(expandMeta);
                setPosts((prev) => (append ? [...prev, ...list] : list));
                if (!append) setPendingPosts([]);
                setHasMore(list.length >= 30);
            } finally {
                setLoading(false);
            }
        },
        [api, spaceId, tag, tab, sort, user],
    );

    useEffect(() => {
        setPage(0);
        fetchPage(0, false);
    }, [fetchPage, feedRefreshKey]);

    // Quietly poll for new posts every 30s on Latest feeds
    useEffect(() => {
        if (tag || sort !== "latest") return;
        if (tab === "following" && !spaceId) return;

        const timer = window.setInterval(async () => {
            if (document.visibilityState !== "visible") return;
            const currentTop = postsRef.current[0];
            if (!currentTop) return;
            try {
                const host = currentDomain();
                const raw = await api.query<[Post, PostMeta][]>(
                    "last_posts",
                    host,
                    spaceId || "",
                    0,
                    0,
                    false,
                );
                if (!raw || raw.length === 0) return;
                const existingIds = new Set(postsRef.current.map((p) => p.id));
                const fresh = raw
                    .map(expandMeta)
                    .filter(
                        (p) => !existingIds.has(p.id) && p.id > currentTop.id,
                    );
                if (fresh.length > 0) {
                    setPendingPosts(fresh);
                }
            } catch {
                // Silent background poll
            }
        }, 30_000);

        return () => window.clearInterval(timer);
    }, [api, spaceId, tag, tab, sort]);

    const handleShowPending = () => {
        if (pendingPosts.length === 0) return;
        setPosts((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const uniqueFresh = pendingPosts.filter((p) => !seen.has(p.id));
            return [...uniqueFresh, ...prev];
        });
        setPendingPosts([]);
    };

    const handleToggleJoin = async () => {
        if (!spaceId) return;
        if (!user) {
            toast(`Sign in to join ${BRAND.communityPlural}`, "error");
            return;
        }
        const joined = await api.call<boolean>(
            "toggle_realm_membership",
            spaceId,
        );
        await Promise.all([refreshUser(), refreshDiscovery()]);
        toast(joined ? `Joined ${spaceId}` : `Left ${spaceId}`);
    };

    const handleOpenEditSpace = () => {
        if (!spaceInfo) return;
        setSpaceDesc(spaceInfo.description || "");
        setSpaceColour(spaceInfo.label_color || BRAND.accent.main);
        setEditSpaceOpen(true);
    };

    const handleSaveSpace = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!spaceId || !spaceInfo) return;
        setSavingSpace(true);
        try {
            const payload = {
                ...spaceInfo,
                description: spaceDesc.trim(),
                label_color: spaceColour,
                posts: [],
            };
            const res = await api.call<ApiResult<null>>(
                "edit_realm",
                spaceId,
                payload,
            );
            if (!res) {
                toast("Could not update Space", "error");
            } else if ("Err" in res) {
                toast(res.Err, "error");
            } else {
                await refreshDiscovery();
                setEditSpaceOpen(false);
                toast(`Updated ${spaceId}`);
            }
        } finally {
            setSavingSpace(false);
        }
    };

    return (
        <div>
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 ui-glass border-b ui-border">
                {spaceId ? (
                    <div className="px-4 py-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => navigate("/spaces")}
                                    className="p-1.5 rounded-full ui-hover ui-text cursor-pointer shrink-0"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                                <span
                                    className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 shadow-xs"
                                    style={spaceBadgeStyle(
                                        spaceId,
                                        spaceInfo?.label_color,
                                    )}
                                >
                                    {spaceId.slice(0, 2)}
                                </span>
                                <div className="min-w-0">
                                    <h1 className="font-bold text-base truncate leading-tight">
                                        {spaceId}
                                    </h1>
                                    <p className="text-xs ui-text-muted truncate">
                                        {spaceInfo?.num_members ?? 0}{" "}
                                        {(spaceInfo?.num_members ?? 0) === 1
                                            ? "member"
                                            : "members"}
                                        {spaceInfo?.description
                                            ? ` · ${spaceInfo.description}`
                                            : ""}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {isSpaceController && (
                                    <button
                                        type="button"
                                        onClick={handleOpenEditSpace}
                                        className="p-1.5 rounded-full ui-pill ui-text-secondary ui-hover cursor-pointer"
                                        title={`Edit ${BRAND.communitySingular}`}
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleToggleJoin}
                                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 cursor-pointer ${
                                        isSpaceMember
                                            ? "ui-pill ui-text-secondary"
                                            : "ui-accent-bg"
                                    }`}
                                >
                                    {isSpaceMember ? "Joined" : "Join"}
                                </button>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 pl-10">
                            <button
                                type="button"
                                onClick={() => setSort("latest")}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition cursor-pointer ${
                                    sort === "latest"
                                        ? "ui-accent-soft font-semibold"
                                        : "ui-text-muted ui-hover"
                                }`}
                            >
                                <Clock className="w-3 h-3" />
                                <span>Latest</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setSort("hot")}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition cursor-pointer ${
                                    sort === "hot"
                                        ? "ui-accent-soft font-semibold"
                                        : "ui-text-muted ui-hover"
                                }`}
                            >
                                <Flame className="w-3 h-3" />
                                <span>Trending</span>
                            </button>
                        </div>
                    </div>
                ) : tag ? (
                    <div className="px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => navigate("/")}
                                className="p-1.5 rounded-full ui-hover ui-text cursor-pointer"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                            <h1 className="font-bold text-base">#{tag}</h1>
                        </div>
                        <button
                            type="button"
                            onClick={() => navigate("/")}
                            className="text-xs ui-accent-text hover:underline cursor-pointer"
                        >
                            Back to feed
                        </button>
                    </div>
                ) : (
                    <div>
                        <div className="grid grid-cols-2 text-sm font-medium">
                            <button
                                type="button"
                                onClick={() => setTab("for-you")}
                                className={`py-3.5 text-center relative ui-hover transition cursor-pointer ${
                                    tab === "for-you"
                                        ? "ui-text font-semibold"
                                        : "ui-text-muted"
                                }`}
                            >
                                For you
                                {tab === "for-you" && (
                                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-0.5 rounded-full ui-accent-bg" />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setTab("following")}
                                className={`py-3.5 text-center relative ui-hover transition cursor-pointer ${
                                    tab === "following"
                                        ? "ui-text font-semibold"
                                        : "ui-text-muted"
                                }`}
                            >
                                Following
                                {tab === "following" && (
                                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-0.5 rounded-full ui-accent-bg" />
                                )}
                            </button>
                        </div>
                        {tab === "for-you" && (
                            <div className="px-4 py-2 border-t ui-border flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setSort("latest")}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition cursor-pointer ${
                                            sort === "latest"
                                                ? "ui-accent-soft font-semibold"
                                                : "ui-text-muted ui-hover"
                                        }`}
                                    >
                                        <Clock className="w-3 h-3" />
                                        <span>Latest</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSort("hot")}
                                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full transition cursor-pointer ${
                                            sort === "hot"
                                                ? "ui-accent-soft font-semibold"
                                                : "ui-text-muted ui-hover"
                                        }`}
                                    >
                                        <Flame className="w-3 h-3" />
                                        <span>Trending</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Inline Composer */}
            {!tag && <Composer defaultSpace={spaceId || null} />}

            {/* Live "New posts" Banner */}
            {pendingPosts.length > 0 && (
                <div className="px-4 py-2.5 border-b ui-border flex justify-center">
                    <button
                        type="button"
                        onClick={handleShowPending}
                        className="px-4 py-1.5 rounded-full ui-accent-bg text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                        <ArrowUp className="w-3.5 h-3.5" />
                        <span>
                            Show {pendingPosts.length} new{" "}
                            {pendingPosts.length === 1 ? "post" : "posts"}
                        </span>
                    </button>
                </div>
            )}

            {/* Feed Stream */}
            <div>
                {loading && posts.length === 0 ? (
                    <div className="py-12 flex justify-center">
                        <Loader2 className="w-5 h-5 animate-spin ui-text-muted" />
                    </div>
                ) : posts.length === 0 ? (
                    <div className="py-14 px-6 text-center space-y-2">
                        <p className="text-sm ui-text-secondary font-medium">
                            {tab === "following" && !spaceId && !tag
                                ? user
                                    ? "Your Following feed is quiet."
                                    : "Sign in to see posts from people you follow."
                                : "No posts here yet."}
                        </p>
                        <p className="text-xs ui-text-muted">
                            {tab === "following" && !spaceId && !tag
                                ? "Follow users or join Spaces to populate this feed."
                                : "Be the first to share something above!"}
                        </p>
                    </div>
                ) : (
                    <>
                        {posts.map((post) => (
                            <PostCard
                                key={post.id}
                                post={post}
                                onDeleted={(id) =>
                                    setPosts((prev) =>
                                        prev.filter((p) => p.id !== id),
                                    )
                                }
                            />
                        ))}
                        {hasMore && (
                            <div className="p-4 flex justify-center">
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => {
                                        const next = page + 1;
                                        setPage(next);
                                        fetchPage(next, true);
                                    }}
                                    className="px-5 py-2 rounded-full ui-surface border ui-border text-xs font-medium ui-hover cursor-pointer disabled:opacity-50"
                                >
                                    {loading ? "Loading..." : "Load more"}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Edit Space Modal */}
            {editSpaceOpen && spaceId && (
                <div
                    className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setEditSpaceOpen(false)}
                >
                    <form
                        onSubmit={handleSaveSpace}
                        onClick={(e) => e.stopPropagation()}
                        toolname="edit_space"
                        tooldescription="Update the description and badge colour of a Space you manage."
                        className="w-full max-w-md rounded-2xl border ui-border-strong ui-surface p-6 shadow-2xl space-y-4"
                    >
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-base">
                                Edit {spaceId}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setEditSpaceOpen(false)}
                                className="p-1 rounded-full ui-hover ui-text-muted cursor-pointer"
                                aria-label="Close edit Space modal"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium ui-text-secondary">
                                Description
                            </label>
                            <textarea
                                name="description"
                                toolparamdescription="Short public description of what this Space is about."
                                rows={3}
                                value={spaceDesc}
                                onChange={(e) => setSpaceDesc(e.target.value)}
                                placeholder="What is this Space about?"
                                className="w-full rounded-xl ui-surface-2 border ui-border px-3 py-2 text-sm ui-text focus:outline-none resize-none"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-medium ui-text-secondary">
                                Badge colour
                            </label>
                            <div className="flex items-center gap-2 flex-wrap">
                                {SPACE_COLOURS.map((hex) => (
                                    <button
                                        key={hex}
                                        type="button"
                                        onClick={() => setSpaceColour(hex)}
                                        className={`w-7 h-7 rounded-full cursor-pointer transition ${
                                            spaceColour === hex
                                                ? "ring-2 ring-offset-2 ring-offset-[var(--ui-surface)] ring-[var(--ui-text)] scale-110"
                                                : "opacity-80 hover:opacity-100"
                                        }`}
                                        style={{ backgroundColor: hex }}
                                        aria-label={`Select colour ${hex}`}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setEditSpaceOpen(false)}
                                className="px-4 py-2 rounded-full ui-pill text-xs ui-text-secondary ui-hover cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={savingSpace}
                                className="px-4 py-2 rounded-full ui-accent-bg text-xs font-semibold disabled:opacity-50 cursor-pointer"
                            >
                                {savingSpace ? "Saving..." : "Save changes"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
