import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { AuthClient } from "@icp-sdk/auth/client";
import { ApiGenerator, Backend } from "./api";
import { BRAND } from "./brand";
import { currentDomain, MAINNET_MODE } from "./env";
import {
    AppInfo,
    Post,
    PostMeta,
    Space,
    SpaceId,
    User,
    UserData,
    UserId,
} from "./types";

export type ThemeMode = "dark" | "light";

export type SuggestedUser = {
    id: UserId;
    name: string;
    displayName?: string;
    avatar?: string;
};

type AppContextValue = {
    api: Backend;
    principalId: string | null;
    user: User | null;
    appInfo: AppInfo | null;
    spaces: [SpaceId, Space][];
    trendingTags: [string, number][];
    suggestedUsers: SuggestedUser[];
    usersData: UserData;
    theme: ThemeMode;
    loading: boolean;
    needsOnboarding: boolean;
    toggleTheme: () => void;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshUser: () => Promise<void>;
    refreshDiscovery: () => Promise<void>;
    toast: (message: string, tone?: "info" | "error") => void;
    openLightbox: (src: string, caption?: string) => void;
    openCreateSpace: () => void;
    createSpaceOpen: boolean;
    setCreateSpaceOpen: (open: boolean) => void;
    feedRefreshKey: number;
    bumpFeed: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = (): AppContextValue => {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useApp must be used inside AppProvider");
    return ctx;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [theme, setTheme] = useState<ThemeMode>(() => {
        const saved = localStorage.getItem("relay_theme");
        return saved === "light" || saved === "dark"
            ? saved
            : BRAND.defaultTheme;
    });
    const [authClient, setAuthClient] = useState<AuthClient | null>(null);
    const [api, setApi] = useState<Backend>(() => ApiGenerator(MAINNET_MODE));
    const [principalId, setPrincipalId] = useState<string | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
    const [spaces, setSpaces] = useState<[SpaceId, Space][]>([]);
    const [trendingTags, setTrendingTags] = useState<[string, number][]>([]);
    const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
    const [usersData, setUsersData] = useState<UserData>({});
    const [loading, setLoading] = useState(true);
    const [toastState, setToastState] = useState<{
        message: string;
        tone: "info" | "error";
    } | null>(null);
    const [lightbox, setLightbox] = useState<{
        src: string;
        caption?: string;
    } | null>(null);
    const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
    const [feedRefreshKey, setFeedRefreshKey] = useState(0);

    // Close lightbox on Escape
    useEffect(() => {
        if (!lightbox) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setLightbox(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [lightbox]);

    // Apply theme & brand accent variables
    useEffect(() => {
        const root = document.documentElement;
        root.setAttribute("data-theme", theme);
        root.style.setProperty("--ui-accent", BRAND.accent.main);
        root.style.setProperty("--ui-accent-hover", BRAND.accent.hover);
        root.style.setProperty("--ui-accent-soft", BRAND.accent.soft);
        localStorage.setItem("relay_theme", theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute(
                "content",
                theme === "dark" ? "#09090b" : "#ffffff",
            );
        }
    }, [theme]);

    const toast = useCallback(
        (message: string, tone: "info" | "error" = "info") => {
            setToastState({ message, tone });
        },
        [],
    );

    useEffect(() => {
        if (!toastState) return;
        const t = setTimeout(() => setToastState(null), 3200);
        return () => clearTimeout(t);
    }, [toastState]);

    const extractAuthors = useCallback(
        (
            recent: [Post, PostMeta][] | null,
        ): {
            suggestions: SuggestedUser[];
            names: UserData;
        } => {
            const suggestions: SuggestedUser[] = [];
            const names: UserData = {};
            const seen = new Set<number>();
            for (const [post, meta] of recent || []) {
                if (!meta?.author_name) continue;
                names[post.user] = meta.author_name;
                if (!seen.has(post.user)) {
                    seen.add(post.user);
                    suggestions.push({
                        id: post.user,
                        name: meta.author_name,
                        displayName: meta.author_display_name,
                        avatar: meta.author_avatar,
                    });
                }
            }
            return { suggestions, names };
        },
        [],
    );

    const fetchSessionData = useCallback(
        async (clientApi: Backend, authenticated: boolean) => {
            const host = currentDomain();
            const [info, allSpaces, tags, me, knownUsers, recentPosts] =
                await Promise.all([
                    clientApi.query<AppInfo>("app_info"),
                    clientApi.query<[SpaceId, Space][]>(
                        "all_realms",
                        host,
                        "popularity",
                        0,
                    ),
                    clientApi.query<[string, number][]>(
                        "recent_tags",
                        host,
                        "",
                        8,
                    ),
                    authenticated
                        ? clientApi.query<User | null>("user", host, [])
                        : Promise.resolve(null),
                    authenticated
                        ? clientApi.query<UserData>("users_data", [])
                        : Promise.resolve(null),
                    clientApi.query<[Post, PostMeta][]>(
                        "last_posts",
                        host,
                        "",
                        0,
                        0,
                        false,
                    ),
                ]);
            if (info) setAppInfo(info);
            if (allSpaces) setSpaces(allSpaces);
            if (tags) setTrendingTags(tags);
            setUser(me ?? null);
            const { suggestions, names } = extractAuthors(recentPosts);
            setSuggestedUsers(suggestions);
            setUsersData((prev) => ({
                ...prev,
                ...names,
                ...(knownUsers || {}),
                ...(me ? { [me.id]: me.name } : {}),
            }));
        },
        [extractAuthors],
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const client = new AuthClient();
                if (cancelled) return;
                setAuthClient(client);
                if (client.isAuthenticated()) {
                    const identity = await client.getIdentity();
                    if (cancelled) return;
                    const p = identity.getPrincipal().toText();
                    const authedApi = ApiGenerator(MAINNET_MODE, identity);
                    setPrincipalId(p);
                    setApi(authedApi);
                    await fetchSessionData(authedApi, true);
                } else {
                    const anonApi = ApiGenerator(MAINNET_MODE);
                    setApi(anonApi);
                    await fetchSessionData(anonApi, false);
                }
            } catch (err) {
                console.error("Bootstrap error:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [fetchSessionData]);

    const signIn = useCallback(async () => {
        if (!authClient) return;
        try {
            const identity = await authClient.signIn({
                maxTimeToLive: BigInt(30 * 24 * 3600) * BigInt(1_000_000_000),
            });
            const p = identity.getPrincipal().toText();
            const authedApi = ApiGenerator(MAINNET_MODE, identity);
            setPrincipalId(p);
            setApi(authedApi);
            await fetchSessionData(authedApi, true);
            toast("Signed in with Internet Identity");
        } catch (err) {
            console.error("Sign-in cancelled or failed:", err);
        }
    }, [authClient, fetchSessionData, toast]);

    const signOut = useCallback(async () => {
        if (authClient) {
            await authClient.signOut();
        }
        const anonApi = ApiGenerator(MAINNET_MODE);
        setPrincipalId(null);
        setUser(null);
        setApi(anonApi);
        await fetchSessionData(anonApi, false);
        toast("Signed out");
    }, [authClient, fetchSessionData, toast]);

    const refreshUser = useCallback(async () => {
        if (!principalId) return;
        const [me, info] = await Promise.all([
            api.query<User | null>("user", currentDomain(), []),
            api.query<AppInfo>("app_info"),
        ]);
        setUser(me ?? null);
        if (info) setAppInfo(info);
    }, [api, principalId]);

    const refreshDiscovery = useCallback(async () => {
        const host = currentDomain();
        const [allSpaces, tags, recentPosts] = await Promise.all([
            api.query<[SpaceId, Space][]>("all_realms", host, "popularity", 0),
            api.query<[string, number][]>("recent_tags", host, "", 8),
            api.query<[Post, PostMeta][]>("last_posts", host, "", 0, 0, false),
        ]);
        if (allSpaces) setSpaces(allSpaces);
        if (tags) setTrendingTags(tags);
        if (recentPosts) {
            const { suggestions, names } = extractAuthors(recentPosts);
            setSuggestedUsers(suggestions);
            setUsersData((prev) => ({ ...prev, ...names }));
        }
    }, [api, extractAuthors]);

    const toggleTheme = useCallback(() => {
        setTheme((prev) => (prev === "dark" ? "light" : "dark"));
    }, []);

    const openLightbox = useCallback((src: string, caption?: string) => {
        setLightbox({ src, caption });
    }, []);

    const openCreateSpace = useCallback(() => {
        if (!user) {
            toast("Please sign in to create a Space", "error");
            return;
        }
        setCreateSpaceOpen(true);
    }, [user, toast]);

    const bumpFeed = useCallback(() => {
        setFeedRefreshKey((k) => k + 1);
    }, []);

    const needsOnboarding = Boolean(principalId && !loading && !user);

    const value = useMemo<AppContextValue>(
        () => ({
            api,
            principalId,
            user,
            appInfo,
            spaces,
            trendingTags,
            suggestedUsers,
            usersData,
            theme,
            loading,
            needsOnboarding,
            toggleTheme,
            signIn,
            signOut,
            refreshUser,
            refreshDiscovery,
            toast,
            openLightbox,
            openCreateSpace,
            createSpaceOpen,
            setCreateSpaceOpen,
            feedRefreshKey,
            bumpFeed,
        }),
        [
            api,
            principalId,
            user,
            appInfo,
            spaces,
            trendingTags,
            suggestedUsers,
            usersData,
            theme,
            loading,
            needsOnboarding,
            toggleTheme,
            signIn,
            signOut,
            refreshUser,
            refreshDiscovery,
            toast,
            openLightbox,
            openCreateSpace,
            createSpaceOpen,
            feedRefreshKey,
            bumpFeed,
        ],
    );

    return (
        <AppContext.Provider value={value}>
            {children}

            {/* Global Image Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
                    onClick={() => setLightbox(null)}
                >
                    <div
                        className="max-w-4xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden border ui-border-strong ui-surface shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <img
                            src={lightbox.src}
                            alt={lightbox.caption || "Image preview"}
                            className="max-h-[80vh] w-auto object-contain bg-black"
                        />
                        <div className="px-4 py-2.5 text-xs ui-text-secondary flex items-center justify-between gap-4">
                            <span className="truncate">
                                {lightbox.caption || "Image"}
                            </span>
                            <button
                                onClick={() => setLightbox(null)}
                                className="font-semibold ui-text hover:underline cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Toast */}
            {toastState && (
                <div
                    className="fixed bottom-20 md:bottom-6 right-5 z-50 rounded-xl px-4 py-2.5 text-xs font-medium shadow-xl border"
                    style={{
                        backgroundColor:
                            toastState.tone === "error"
                                ? "var(--ui-danger)"
                                : "var(--ui-surface-2)",
                        borderColor:
                            toastState.tone === "error"
                                ? "var(--ui-danger)"
                                : "var(--ui-border-strong)",
                        color:
                            toastState.tone === "error"
                                ? "#ffffff"
                                : "var(--ui-text)",
                    }}
                >
                    {toastState.message}
                </div>
            )}
        </AppContext.Provider>
    );
};
