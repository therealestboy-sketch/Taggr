import React, { useEffect, useState } from "react";
import { Hash, Loader2, Search, User as UserIcon } from "lucide-react";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { currentDomain } from "../env";
import { navigate } from "../router";
import { SearchResult } from "../types";

export const ExplorePage: React.FC<{ initialQuery?: string }> = ({
    initialQuery = "",
}) => {
    const { api, trendingTags, spaces } = useApp();
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        setQuery(initialQuery);
    }, [initialQuery]);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setResults([]);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await api.query<SearchResult[]>(
                    "search",
                    currentDomain(),
                    trimmed,
                );
                if (!cancelled) setResults(res || []);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [api, query]);

    return (
        <div>
            <div className="sticky top-0 z-20 ui-glass border-b ui-border px-4 py-3 space-y-2.5">
                <h1 className="font-bold text-base">Explore</h1>
                <div className="relative">
                    <Search className="w-4 h-4 ui-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={`Search posts, @users, #hashtags, or ${BRAND.communityPlural.toLowerCase()}...`}
                        className="w-full rounded-full ui-surface border ui-border pl-10 pr-4 py-2 text-sm ui-text focus:outline-none"
                    />
                </div>
            </div>

            {query.trim().length >= 2 ? (
                searching ? (
                    <div className="py-12 flex justify-center">
                        <Loader2 className="w-5 h-5 animate-spin ui-text-muted" />
                    </div>
                ) : results.length === 0 ? (
                    <div className="py-12 text-center text-sm ui-text-muted">
                        No results found for “{query.trim()}”.
                    </div>
                ) : (
                    <div className="divide-y ui-border">
                        {results.map((item, idx) => {
                            if (item.result === "user") {
                                return (
                                    <button
                                        key={`u-${idx}`}
                                        type="button"
                                        onClick={() =>
                                            navigate(`/user/${item.generic_id}`)
                                        }
                                        className="w-full px-4 py-3.5 text-left flex items-start gap-3 ui-hover cursor-pointer"
                                    >
                                        <span className="w-8 h-8 rounded-full ui-accent-soft flex items-center justify-center shrink-0">
                                            <UserIcon className="w-4 h-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold ui-text">
                                                @{item.generic_id}
                                            </div>
                                            {item.relevant && (
                                                <p className="text-xs ui-text-secondary line-clamp-2">
                                                    {item.relevant}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                );
                            }
                            if (item.result === "tag") {
                                return (
                                    <button
                                        key={`t-${idx}`}
                                        type="button"
                                        onClick={() =>
                                            navigate(`/tag/${item.generic_id}`)
                                        }
                                        className="w-full px-4 py-3.5 text-left flex items-center gap-3 ui-hover cursor-pointer"
                                    >
                                        <span className="w-8 h-8 rounded-full ui-surface-2 flex items-center justify-center shrink-0 ui-accent-text">
                                            <Hash className="w-4 h-4" />
                                        </span>
                                        <span className="text-sm font-semibold ui-text">
                                            #{item.generic_id}
                                        </span>
                                    </button>
                                );
                            }
                            if (item.result === "realm") {
                                return (
                                    <button
                                        key={`s-${idx}`}
                                        type="button"
                                        onClick={() =>
                                            navigate(
                                                `/space/${item.generic_id}`,
                                            )
                                        }
                                        className="w-full px-4 py-3.5 text-left flex items-start gap-3 ui-hover cursor-pointer"
                                    >
                                        <span className="w-8 h-8 rounded-xl ui-accent-soft flex items-center justify-center text-xs font-bold shrink-0">
                                            {item.generic_id.slice(0, 2)}
                                        </span>
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold ui-text">
                                                {item.generic_id}
                                            </div>
                                            {item.relevant && (
                                                <p className="text-xs ui-text-secondary line-clamp-2">
                                                    {item.relevant}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                );
                            }
                            return (
                                <button
                                    key={`p-${idx}`}
                                    type="button"
                                    onClick={() => navigate(`/post/${item.id}`)}
                                    className="w-full px-4 py-3.5 text-left space-y-1 ui-hover cursor-pointer"
                                >
                                    <div className="text-xs ui-text-muted">
                                        Post #{item.id}
                                    </div>
                                    <p className="text-sm ui-text line-clamp-3">
                                        {item.relevant}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                )
            ) : (
                <div className="p-4 space-y-6">
                    <section className="space-y-2.5">
                        <h2 className="text-xs font-semibold uppercase tracking-wider ui-text-muted">
                            Trending hashtags
                        </h2>
                        {trendingTags.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {trendingTags.map(([tag, count]) => (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() => navigate(`/tag/${tag}`)}
                                        className="px-3 py-1.5 rounded-full ui-surface border ui-border text-xs font-medium ui-hover cursor-pointer"
                                    >
                                        #{tag}{" "}
                                        <span className="ui-text-muted">
                                            ({count})
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs ui-text-muted">
                                No trending hashtags yet.
                            </p>
                        )}
                    </section>

                    <section className="space-y-2.5">
                        <h2 className="text-xs font-semibold uppercase tracking-wider ui-text-muted">
                            Active {BRAND.communityPlural}
                        </h2>
                        {spaces.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {spaces.slice(0, 6).map(([id, sp]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => navigate(`/space/${id}`)}
                                        className="p-3 rounded-2xl ui-surface border ui-border text-left ui-hover transition cursor-pointer space-y-1"
                                    >
                                        <div className="font-semibold text-sm ui-text">
                                            {id}
                                        </div>
                                        <p className="text-xs ui-text-secondary line-clamp-2">
                                            {sp.description ||
                                                "Topic community"}
                                        </p>
                                        <div className="text-[11px] ui-text-muted">
                                            {sp.num_members} members
                                        </div>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs ui-text-muted">
                                No {BRAND.communityPlural.toLowerCase()} yet.
                            </p>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};
