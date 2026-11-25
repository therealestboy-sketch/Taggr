export type AccentPreset = {
    name: string;
    main: string;
    hover: string;
    soft: string;
};

export const ACCENT_PRESETS: Record<string, AccentPreset> = {
    blue: {
        name: "Electric Blue",
        main: "#3b82f6",
        hover: "#2563eb",
        soft: "rgba(59, 130, 246, 0.14)",
    },
    indigo: {
        name: "Indigo",
        main: "#6366f1",
        hover: "#4f46e5",
        soft: "rgba(99, 102, 241, 0.14)",
    },
    emerald: {
        name: "Emerald",
        main: "#10b981",
        hover: "#059669",
        soft: "rgba(16, 185, 129, 0.14)",
    },
    violet: {
        name: "Violet",
        main: "#8b5cf6",
        hover: "#7c3aed",
        soft: "rgba(139, 92, 246, 0.14)",
    },
    amber: {
        name: "Amber",
        main: "#f59e0b",
        hover: "#d97706",
        soft: "rgba(245, 158, 11, 0.15)",
    },
    rose: {
        name: "Rose",
        main: "#f43f5e",
        hover: "#e11d48",
        soft: "rgba(244, 63, 94, 0.14)",
    },
};

/**
 * Centralised brand configuration.
 * Change name, tagline, community labels, or accent preset in one place.
 */
export const BRAND = {
    name: "Relay",
    tagline: "An open, ad-free social space on the Internet Computer.",
    communitySingular: "Space",
    communityPlural: "Spaces",
    defaultTheme: "dark" as "dark" | "light",
    accent: ACCENT_PRESETS.blue,
    reactions: [
        { id: 12, emoji: "❤️", label: "Love" },
        { id: 50, emoji: "🔥", label: "Fire" },
        { id: 10, emoji: "👍", label: "Like" },
        { id: 51, emoji: "😂", label: "Laugh" },
        { id: 53, emoji: "🚀", label: "Rocket" },
        { id: 52, emoji: "💯", label: "100" },
    ] as const,
};

export const REACTION_BY_ID: Record<number, { emoji: string; label: string }> =
    Object.fromEntries(
        BRAND.reactions.map((r) => [r.id, { emoji: r.emoji, label: r.label }]),
    );
