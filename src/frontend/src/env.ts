const CANISTER_HOST_RE =
    /^([a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{3})\.(?:raw\.)?(?:icp0\.io|ic0\.app|icp\.net|localhost)$/i;

export function detectCanisterId(): string {
    const envId = (process.env.CANISTER_ID || "").trim();
    if (envId) return envId;

    if (typeof window !== "undefined") {
        const match = window.location.hostname.match(CANISTER_HOST_RE);
        if (match) return match[1];
        const params = new URLSearchParams(window.location.search);
        const queryId = params.get("canisterId");
        if (queryId) return queryId;
    }
    return "";
}

export const CANISTER_ID = detectCanisterId();

export const MAINNET_MODE =
    process.env.DFX_NETWORK === "ic" ||
    process.env.DFX_NETWORK === "staging" ||
    (typeof window !== "undefined" &&
        !window.location.hostname.includes("localhost") &&
        !window.location.hostname.startsWith("127."));

export const currentDomain = (): string => {
    if (typeof window === "undefined") return "localhost";
    return window.location.hostname || "localhost";
};

export const bucketImageUrl = (
    bucketId: string,
    offset: number,
    len: number,
): string => {
    if (MAINNET_MODE) {
        return `https://${bucketId}.raw.icp0.io/image?offset=${offset}&len=${len}`;
    }
    const port =
        typeof window !== "undefined" && window.location.port
            ? window.location.port
            : "8000";
    return `http://${bucketId}.localhost:${port}/image?offset=${offset}&len=${len}`;
};

export const II_URL = MAINNET_MODE
    ? "https://id.ai"
    : "https://identity.ic0.app";
