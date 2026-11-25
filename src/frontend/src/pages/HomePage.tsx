import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { expandMeta } from "../api";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { Composer } from "../components/Composer";
import { PostCard } from "../components/PostCard";
import { currentDomain } from "../env";
import { navigate } from "../router";
import { Post, PostMeta } from "../types";

type HomePageProps = {
    spaceId?: string;
    tag?: string;
};

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
    const [posts, setPosts] = useState<Post[]>([]);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(false);

    const spaceInfo = spaceId
        ? spaces.find(([id]) => id === spaceId)?.[1]
        : undefined;
    const isSpaceMember = Boolean(spaceId && user?.realms?.includes(spaceId));

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
                        "last_posts",
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
                        "last_posts",
                        host,
                        "",
                        targetPage,
                        0,
                        false,
                    );
                }
                const list = (raw || []).map(expandMeta);
                setPosts((prev) => (append ? [...prev, ...list] : list));
                setHasMore(list.length >= 30);
            } finally {
                setLoading(false);
            }
        },
        [api, spaceId, tag, tab, user],
    );

    useEffect(() => {
        setPage(0);
        fetchPage(0, false);
    }, [fetchPage, feedRefreshKey]);

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

    return (
        <div>
            {/* Sticky Header */}
            <div className="sticky top-0 z-20 ui-glass border-b ui-border">
                {spaceId ? (
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <button
                                type="button"
                                onClick={() => navigate("/spaces")}
                                className="p-1.5 rounded-full ui-hover ui-text cursor-pointer"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                            <div className="min-w-0">
                                <h1 className="font-bold text-base truncate">
                                    {spaceId}
                                </h1>
                                {spaceInfo?.description && (
                                    <p className="text-xs ui-text-muted truncate">
                                        {spaceInfo.description}
                                    </p>
                                )}
                            </div>
                        </div>
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
                )}
            </div>

            {/* Inline Composer */}
            {!tag && <Composer defaultSpace={spaceId || null} />}

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
        </div>
    );
};
