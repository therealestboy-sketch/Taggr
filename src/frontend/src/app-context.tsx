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
import { AppInfo, Space, SpaceId, User, UserData } from "./types";

export type ThemeMode = "dark" | "light";

type AppContextValue = {
    api: Backend;
    principalId: string | null;
    user: User | null;
    appInfo: AppInfo | null;
    spaces: [SpaceId, Space][];
    trendingTags: [string, number][];
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

    const fetchSessionData = useCallback(
        async (clientApi: Backend, authenticated: boolean) => {
            const host = currentDomain();
            const [info, allSpaces, tags, me, knownUsers] = await Promise.all([
                clientApi.query<AppInfo>("app_info"),
                clientApi.query<[SpaceId, Space][]>(
                    "all_realms",
                    host,
                    "popularity",
                    0,
                ),
                clientApi.query<[string, number][]>("recent_tags", host, "", 8),
                authenticated
                    ? clientApi.query<User | null>("user", host, [])
                    : Promise.resolve(null),
                authenticated
                    ? clientApi.query<UserData>("users_data", [])
                    : Promise.resolve(null),
            ]);
            if (info) setAppInfo(info);
            if (allSpaces) setSpaces(allSpaces);
            if (tags) setTrendingTags(tags);
            setUser(me ?? null);
            if (knownUsers)
                setUsersData((prev) => ({ ...prev, ...knownUsers }));
        },
        [],
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
        const [allSpaces, tags] = await Promise.all([
            api.query<[SpaceId, Space][]>("all_realms", host, "popularity", 0),
            api.query<[string, number][]>("recent_tags", host, "", 8),
        ]);
        if (allSpaces) setSpaces(allSpaces);
        if (tags) setTrendingTags(tags);
    }, [api]);

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
