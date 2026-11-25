import React, { useState } from "react";
import {
    Bell,
    Bookmark,
    Home,
    LayoutGrid,
    LogIn,
    Moon,
    Plus,
    Search,
    Settings,
    Sun,
    User as UserIcon,
} from "lucide-react";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { navigate, Route } from "../router";
import { avatarGradient, avatarInitials } from "../utils";
import { BrandLogo } from "./BrandLogo";

type LayoutProps = {
    route: Route;
    children: React.ReactNode;
};

export const Layout: React.FC<LayoutProps> = ({ route, children }) => {
    const {
        api,
        user,
        appInfo,
        spaces,
        trendingTags,
        theme,
        toggleTheme,
        signIn,
        refreshUser,
        refreshDiscovery,
        toast,
    } = useApp();
    const [searchText, setSearchText] = useState("");

    const unreadCount = user
        ? Object.values(user.notifications || {}).filter(([, unread]) => unread)
              .length
        : 0;

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const q = searchText.trim();
        navigate(q ? `/explore/${encodeURIComponent(q)}` : "/explore");
    };

    const handleToggleJoinSpace = async (spaceId: string) => {
        if (!user) {
            toast("Sign in to join Spaces", "error");
            return;
        }
        const joined = await api.call<boolean>(
            "toggle_realm_membership",
            spaceId,
        );
        await Promise.all([refreshUser(), refreshDiscovery()]);
        toast(joined ? `Joined ${spaceId}` : `Left ${spaceId}`);
    };

    const handleFocusComposer = () => {
        if (route.name !== "home") {
            navigate("/");
        }
        setTimeout(() => {
            const el = document.getElementById("composer-textarea");
            if (el) {
                el.focus();
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 60);
    };

    const navItems = [
        {
            id: "home",
            label: "Home",
            path: "/",
            icon: Home,
            active:
                route.name === "home" ||
                route.name === "post" ||
                route.name === "tag",
        },
        {
            id: "spaces",
            label: BRAND.communityPlural,
            path: "/spaces",
            icon: LayoutGrid,
            active: route.name === "spaces" || route.name === "space",
        },
        {
            id: "explore",
            label: "Explore",
            path: "/explore",
            icon: Search,
            active: route.name === "explore",
        },
        {
            id: "notifications",
            label: "Notifications",
            path: "/notifications",
            icon: Bell,
            badge: unreadCount,
            active: route.name === "notifications",
        },
        {
            id: "bookmarks",
            label: "Bookmarks",
            path: "/bookmarks",
            icon: Bookmark,
            active: route.name === "bookmarks",
        },
        {
            id: "profile",
            label: "Profile",
            path: user ? `/user/${user.name}` : "/settings",
            icon: UserIcon,
            active:
                route.name === "user" &&
                Boolean(user && route.handle === user.name),
        },
        {
            id: "settings",
            label: appInfo?.is_admin ? "Settings & Admin" : "Settings",
            path: "/settings",
            icon: Settings,
            active: route.name === "settings",
        },
    ];

    return (
        <div className="min-h-screen ui-bg ui-text">
            {/* Mobile Top Bar */}
            <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b ui-border ui-glass">
                <button
                    type="button"
                    onClick={() => navigate("/")}
                    className="cursor-pointer"
                >
                    <BrandLogo size="sm" />
                </button>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="p-2 rounded-full ui-hover ui-text-secondary cursor-pointer"
                        aria-label="Toggle theme"
                    >
                        {theme === "dark" ? (
                            <Sun className="w-4 h-4" />
                        ) : (
                            <Moon className="w-4 h-4" />
                        )}
                    </button>
                    {user ? (
                        <button
                            type="button"
                            onClick={() => navigate(`/user/${user.name}`)}
                            className="w-8 h-8 rounded-full font-bold text-xs text-white flex items-center justify-center cursor-pointer"
                            style={{ background: avatarGradient(user.name) }}
                        >
                            {avatarInitials(user.name)}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={signIn}
                            className="px-3 py-1.5 rounded-full ui-accent-bg text-xs font-semibold cursor-pointer"
                        >
                            Sign in
                        </button>
                    )}
                </div>
            </header>

            {/* 3-Column Container */}
            <div className="max-w-[1260px] mx-auto flex justify-center w-full">
                {/* LEFT SIDEBAR */}
                <aside className="hidden md:flex flex-col justify-between w-[240px] lg:w-[256px] shrink-0 sticky top-0 h-screen px-3 py-5">
                    <div className="space-y-6">
                        <button
                            type="button"
                            onClick={() => navigate("/")}
                            className="px-3 py-1 rounded-xl ui-hover transition cursor-pointer w-fit"
                        >
                            <BrandLogo />
                        </button>

                        <nav className="space-y-1">
                            {navItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => navigate(item.path)}
                                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition cursor-pointer ${
                                            item.active
                                                ? "font-semibold ui-surface ui-text"
                                                : "ui-text-secondary ui-hover"
                                        }`}
                                    >
                                        <span className="flex items-center gap-3">
                                            <Icon
                                                className={`w-5 h-5 ${item.active ? "ui-accent-text" : ""}`}
                                            />
                                            <span>{item.label}</span>
                                        </span>
                                        {item.badge ? (
                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full ui-accent-bg">
                                                {item.badge}
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </nav>

                        <div className="px-1 pt-1">
                            <button
                                type="button"
                                onClick={handleFocusComposer}
                                className="w-full py-2.5 px-4 rounded-full ui-accent-bg font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                <span>New post</span>
                            </button>
                        </div>
                    </div>

                    {/* User / Auth Footer Card */}
                    <div className="pt-2">
                        {user ? (
                            <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl ui-surface border ui-border">
                                <button
                                    type="button"
                                    onClick={() =>
                                        navigate(`/user/${user.name}`)
                                    }
                                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                                >
                                    <div
                                        className="w-9 h-9 rounded-full font-bold text-xs text-white flex items-center justify-center shrink-0"
                                        style={{
                                            background: avatarGradient(
                                                user.name,
                                            ),
                                        }}
                                    >
                                        {avatarInitials(user.name)}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-semibold text-sm truncate">
                                                @{user.name}
                                            </span>
                                            {appInfo?.is_admin && (
                                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ui-accent-soft">
                                                    ADMIN
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs ui-text-muted truncate">
                                            Passkey · Signed in
                                        </div>
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={toggleTheme}
                                    className="p-2 rounded-full ui-hover ui-text-secondary shrink-0 cursor-pointer"
                                    title="Switch light/dark theme"
                                >
                                    {theme === "dark" ? (
                                        <Sun className="w-4 h-4" />
                                    ) : (
                                        <Moon className="w-4 h-4" />
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div className="p-3 rounded-2xl ui-surface border ui-border space-y-2.5">
                                <button
                                    type="button"
                                    onClick={signIn}
                                    className="w-full py-2 px-3 rounded-full ui-accent-bg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <LogIn className="w-3.5 h-3.5" />
                                    <span>Sign in with Passkey</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={toggleTheme}
                                    className="w-full py-1.5 px-3 rounded-full ui-pill text-xs ui-text-secondary flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                    {theme === "dark" ? (
                                        <>
                                            <Sun className="w-3.5 h-3.5" />
                                            <span>Light mode</span>
                                        </>
                                    ) : (
                                        <>
                                            <Moon className="w-3.5 h-3.5" />
                                            <span>Dark mode</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                </aside>

                {/* CENTRE STREAM */}
                <main className="w-full max-w-[620px] min-h-screen md:border-x ui-border pb-20 md:pb-8 flex flex-col">
                    {children}
                </main>

                {/* RIGHT DISCOVERY SIDEBAR */}
                <aside className="hidden xl:flex flex-col gap-4 w-[310px] shrink-0 sticky top-0 h-screen px-4 py-4 overflow-y-auto">
                    <form onSubmit={handleSearchSubmit} className="relative">
                        <Search className="w-4 h-4 ui-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder="Search posts, #tags, @users"
                            className="w-full rounded-full ui-surface border ui-border pl-10 pr-4 py-2 text-sm ui-text placeholder:opacity-60 focus:outline-none"
                        />
                    </form>

                    {/* Spaces Card */}
                    <div className="rounded-2xl ui-surface border ui-border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-sm tracking-tight">
                                {BRAND.communityPlural}
                            </h3>
                            <button
                                type="button"
                                onClick={() => navigate("/spaces")}
                                className="text-xs ui-accent-text hover:underline cursor-pointer"
                            >
                                Browse all
                            </button>
                        </div>
                        {spaces.length > 0 ? (
                            <div className="space-y-2.5">
                                {spaces.slice(0, 5).map(([id, sp]) => {
                                    const joined = Boolean(
                                        user?.realms?.includes(id),
                                    );
                                    return (
                                        <div
                                            key={id}
                                            className="flex items-center justify-between gap-2"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    navigate(`/space/${id}`)
                                                }
                                                className="flex items-center gap-2.5 min-w-0 text-left group cursor-pointer"
                                            >
                                                <span className="w-8 h-8 rounded-xl ui-surface-2 border ui-border flex items-center justify-center text-xs font-bold ui-accent-text shrink-0">
                                                    {id.slice(0, 2)}
                                                </span>
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium truncate group-hover:underline">
                                                        {id}
                                                    </div>
                                                    <div className="text-xs ui-text-muted">
                                                        {sp.num_members}{" "}
                                                        {sp.num_members === 1
                                                            ? "member"
                                                            : "members"}
                                                    </div>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handleToggleJoinSpace(id)
                                                }
                                                className={`text-xs font-medium px-3 py-1 rounded-full transition cursor-pointer shrink-0 ${
                                                    joined
                                                        ? "ui-pill ui-text-secondary"
                                                        : "ui-accent-soft"
                                                }`}
                                            >
                                                {joined ? "Joined" : "Join"}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-xs ui-text-muted">
                                No {BRAND.communityPlural.toLowerCase()} yet.{" "}
                                <button
                                    type="button"
                                    onClick={() => navigate("/spaces")}
                                    className="ui-accent-text hover:underline cursor-pointer"
                                >
                                    Create the first one
                                </button>
                            </p>
                        )}
                    </div>

                    {/* Trending Hashtags Card */}
                    <div className="rounded-2xl ui-surface border ui-border p-4 space-y-3">
                        <h3 className="font-semibold text-sm tracking-tight">
                            Trending hashtags
                        </h3>
                        {trendingTags.length > 0 ? (
                            <div className="space-y-1.5">
                                {trendingTags.map(([tag, count]) => (
                                    <button
                                        key={tag}
                                        type="button"
                                        onClick={() => navigate(`/tag/${tag}`)}
                                        className="w-full flex items-center justify-between py-1 px-2 -mx-2 rounded-lg ui-hover transition text-left cursor-pointer"
                                    >
                                        <span className="text-sm font-medium ui-text truncate">
                                            #{tag}
                                        </span>
                                        <span className="text-xs ui-text-muted shrink-0">
                                            {count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs ui-text-muted">
                                Add #hashtags to your posts to see trending
                                topics here.
                            </p>
                        )}
                    </div>

                    {/* Subtle IC Footer */}
                    <div className="px-2 text-xs ui-text-muted leading-relaxed space-y-1">
                        <div className="flex items-center gap-1.5">
                            <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{
                                    backgroundColor: "var(--ui-success)",
                                }}
                            />
                            <span>Hosted on the Internet Computer</span>
                        </div>
                        <div>
                            {BRAND.name} · Open &amp; ad-free · Passkey login
                        </div>
                    </div>
                </aside>
            </div>

            {/* Mobile Bottom Navigation */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around px-2 py-2 border-t ui-border ui-glass">
                <button
                    type="button"
                    onClick={() => navigate("/")}
                    className={`p-2 rounded-xl cursor-pointer ${route.name === "home" ? "ui-accent-text" : "ui-text-muted"}`}
                    aria-label="Home"
                >
                    <Home className="w-5 h-5" />
                </button>
                <button
                    type="button"
                    onClick={() => navigate("/spaces")}
                    className={`p-2 rounded-xl cursor-pointer ${route.name === "spaces" || route.name === "space" ? "ui-accent-text" : "ui-text-muted"}`}
                    aria-label={BRAND.communityPlural}
                >
                    <LayoutGrid className="w-5 h-5" />
                </button>
                <button
                    type="button"
                    onClick={handleFocusComposer}
                    className="w-10 h-10 rounded-full ui-accent-bg flex items-center justify-center shadow-sm cursor-pointer"
                    aria-label="New post"
                >
                    <Plus className="w-5 h-5" />
                </button>
                <button
                    type="button"
                    onClick={() => navigate("/notifications")}
                    className={`relative p-2 rounded-xl cursor-pointer ${route.name === "notifications" ? "ui-accent-text" : "ui-text-muted"}`}
                    aria-label="Notifications"
                >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full ui-accent-bg" />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() =>
                        navigate(user ? `/user/${user.name}` : "/settings")
                    }
                    className={`p-2 rounded-xl cursor-pointer ${route.name === "user" || route.name === "settings" ? "ui-accent-text" : "ui-text-muted"}`}
                    aria-label="Profile"
                >
                    <UserIcon className="w-5 h-5" />
                </button>
            </nav>
        </div>
    );
};
