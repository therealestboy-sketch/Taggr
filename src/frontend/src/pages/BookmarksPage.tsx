import React, { useEffect, useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { expandMeta } from "../api";
import { useApp } from "../app-context";
import { PostCard } from "../components/PostCard";
import { Post, PostMeta } from "../types";

export const BookmarksPage: React.FC = () => {
    const { api, user, signIn } = useApp();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user || !user.bookmarks || user.bookmarks.length === 0) {
            setPosts([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        api.query<[Post, PostMeta][]>("posts", [...user.bookmarks].reverse())
            .then((res) => {
                if (!cancelled) setPosts((res || []).map(expandMeta));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [api, user]);

    if (!user) {
        return (
            <div>
                <div className="sticky top-0 z-20 ui-glass border-b ui-border px-4 py-3">
                    <h1 className="font-bold text-base">Bookmarks</h1>
                </div>
                <div className="py-14 px-6 text-center space-y-3">
                    <p className="text-sm ui-text-secondary">
                        Sign in to view your saved posts.
                    </p>
                    <button
                        type="button"
                        onClick={signIn}
                        className="px-4 py-2 rounded-full ui-accent-bg text-xs font-semibold cursor-pointer"
                    >
                        Sign in with Passkey
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="sticky top-0 z-20 ui-glass border-b ui-border px-4 py-3">
                <h1 className="font-bold text-base">Bookmarks</h1>
                <p className="text-xs ui-text-muted">
                    {posts.length} saved {posts.length === 1 ? "post" : "posts"}
                </p>
            </div>

            {loading ? (
                <div className="py-12 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin ui-text-muted" />
                </div>
            ) : posts.length === 0 ? (
                <div className="py-14 px-6 text-center space-y-2">
                    <Bookmark className="w-6 h-6 mx-auto ui-text-muted opacity-60" />
                    <p className="text-sm ui-text-muted">
                        No bookmarks yet. Tap the bookmark icon on any post to
                        save it here.
                    </p>
                </div>
            ) : (
                posts.map((post) => (
                    <PostCard
                        key={post.id}
                        post={post}
                        onDeleted={(id) =>
                            setPosts((prev) => prev.filter((p) => p.id !== id))
                        }
                    />
                ))
            )}
        </div>
    );
};
