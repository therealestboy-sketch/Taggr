import { useSyncExternalStore } from "react";

export type Route =
    | { name: "home" }
    | { name: "spaces" }
    | { name: "space"; id: string }
    | { name: "tag"; tag: string }
    | { name: "post"; id: number }
    | { name: "user"; handle: string }
    | { name: "explore"; query?: string }
    | { name: "notifications" }
    | { name: "bookmarks" }
    | { name: "settings" };

function parseHash(rawHash: string): Route {
    const cleaned = rawHash.replace(/^#\/?/, "");
    const parts = cleaned.split("/").filter(Boolean).map(decodeURIComponent);
    const [head = "", param = ""] = parts;

    switch (head) {
        case "":
        case "home":
            return { name: "home" };
        case "spaces":
        case "realms":
            return { name: "spaces" };
        case "space":
        case "realm":
            return param
                ? { name: "space", id: param.toUpperCase() }
                : { name: "spaces" };
        case "tag":
        case "feed":
            return param ? { name: "tag", tag: param } : { name: "home" };
        case "post":
        case "thread": {
            const id = parseInt(param, 10);
            return Number.isFinite(id)
                ? { name: "post", id }
                : { name: "home" };
        }
        case "user":
        case "profile":
            return param ? { name: "user", handle: param } : { name: "home" };
        case "explore":
        case "search":
            return { name: "explore", query: param || undefined };
        case "notifications":
        case "inbox":
            return { name: "notifications" };
        case "bookmarks":
            return { name: "bookmarks" };
        case "settings":
        case "admin":
            return { name: "settings" };
        default:
            return { name: "home" };
    }
}

export function navigate(path: string): void {
    const target = path.startsWith("#") ? path : `#${path}`;
    if (window.location.hash !== target) {
        window.location.hash = target;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function subscribe(callback: () => void): () => void {
    window.addEventListener("hashchange", callback);
    return () => window.removeEventListener("hashchange", callback);
}

function getSnapshot(): string {
    return window.location.hash || "#/";
}

export function useRoute(): Route {
    const hash = useSyncExternalStore(subscribe, getSnapshot);
    return parseHash(hash);
}
