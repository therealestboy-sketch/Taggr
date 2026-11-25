import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { expandMeta } from "../api";
import { useApp } from "../app-context";
import { Composer } from "../components/Composer";
import { PostCard } from "../components/PostCard";
import { navigate } from "../router";
import { Post, PostMeta } from "../types";

export const ThreadPage: React.FC<{ postId: number }> = ({ postId }) => {
    const { api, feedRefreshKey } = useApp();
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);

    const loadThread = useCallback(async () => {
        setLoading(true);
        try {
            const raw = await api.query<[Post, PostMeta][]>("thread", postId);
            setPosts((raw || []).map(expandMeta));
        } finally {
            setLoading(false);
        }
    }, [api, postId]);

    useEffect(() => {
        loadThread();
    }, [loadThread, feedRefreshKey]);

    const rootPost = posts.find((p) => p.id === postId) || posts[0];
    const replies = posts.filter((p) => p.id !== rootPost?.id);

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
                <h1 className="font-bold text-base">Thread</h1>
            </div>

            {loading ? (
                <div className="py-12 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin ui-text-muted" />
                </div>
            ) : !rootPost ? (
                <div className="py-14 text-center text-sm ui-text-muted">
                    Post not found.
                </div>
            ) : (
                <>
                    {rootPost.parent !== undefined &&
                        rootPost.parent !== null && (
                            <div className="px-4 py-2 border-b ui-border text-xs ui-text-muted">
                                <button
                                    type="button"
                                    onClick={() =>
                                        navigate(`/post/${rootPost.parent}`)
                                    }
                                    className="ui-accent-text hover:underline cursor-pointer"
                                >
                                    View parent post #{rootPost.parent}
                                </button>
                            </div>
                        )}
                    <PostCard
                        post={rootPost}
                        inThread
                        onDeleted={() => navigate("/")}
                    />
                    <Composer
                        parentId={rootPost.id}
                        defaultSpace={rootPost.realm || null}
                        placeholder={`Reply to @${rootPost.meta?.author_name || "post"}...`}
                        compact
                        onPublished={() => loadThread()}
                    />
                    {replies.length === 0 ? (
                        <div className="py-10 text-center text-sm ui-text-muted">
                            No replies yet. Start the conversation above.
                        </div>
                    ) : (
                        replies.map((reply) => (
                            <PostCard
                                key={reply.id}
                                post={reply}
                                onDeleted={(id) =>
                                    setPosts((prev) =>
                                        prev.filter((p) => p.id !== id),
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
