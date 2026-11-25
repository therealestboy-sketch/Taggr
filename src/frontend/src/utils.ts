import { bucketImageUrl } from "./env";

const AVATAR_GRADIENTS = [
    "linear-gradient(135deg, #3b82f6, #6366f1)",
    "linear-gradient(135deg, #10b981, #0ea5e9)",
    "linear-gradient(135deg, #f59e0b, #ef4444)",
    "linear-gradient(135deg, #ec4899, #8b5cf6)",
    "linear-gradient(135deg, #14b8a6, #6366f1)",
    "linear-gradient(135deg, #f97316, #db2777)",
];

export function avatarGradient(seed: string | number): string {
    const str = String(seed);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export function avatarInitials(name: string): string {
    const clean = name.trim();
    if (!clean) return "?";
    return clean.slice(0, 2).toUpperCase();
}

/**
 * Resolves a stored media ref ("<bucketId>:<offset>:<len>") or direct URL
 * into a loadable image URL.
 */
export function resolveMediaRef(ref?: string | null): string | null {
    if (!ref) return null;
    const trimmed = ref.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
        return trimmed;
    }
    const parts = trimmed.split(":");
    if (parts.length === 3) {
        const [bucketId, offsetStr, lenStr] = parts;
        const offset = Number(offsetStr);
        const len = Number(lenStr);
        if (bucketId && Number.isFinite(offset) && Number.isFinite(len)) {
            return bucketImageUrl(bucketId, offset, len);
        }
    }
    return null;
}

export function formatRelativeTime(timestampNs: number): string {
    const ms = Math.floor(timestampNs / 1_000_000);
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
    if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d`;
    return new Date(ms).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
    });
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compresses an uploaded image client-side so it fits comfortably within
 * the canister's per-image byte limit while preserving sharpness.
 */
export async function compressImageFile(
    file: File,
    maxBytes: number,
): Promise<Uint8Array> {
    if (file.type === "image/gif" && file.size <= maxBytes) {
        return new Uint8Array(await file.arrayBuffer());
    }

    const bitmap = await createImageBitmap(file);
    let width = bitmap.width;
    let height = bitmap.height;
    const maxDim = 1600;
    if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        bitmap.close();
        return new Uint8Array(await file.arrayBuffer());
    }

    for (const scale of [1, 0.8, 0.65, 0.5]) {
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

        for (const quality of [0.85, 0.72, 0.58]) {
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/webp", quality),
            );
            if (blob && blob.size <= maxBytes) {
                bitmap.close();
                return new Uint8Array(await blob.arrayBuffer());
            }
        }
    }

    bitmap.close();
    throw new Error(
        `Image could not be compressed under ${Math.round(maxBytes / 1024)} KB.`,
    );
}

/**
 * Centre-crops and compresses a profile picture into a sharp 400x400 WebP square.
 */
export async function compressAvatarFile(
    file: File,
    maxBytes: number,
): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.floor((bitmap.width - side) / 2);
    const sy = Math.floor((bitmap.height - side) / 2);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        bitmap.close();
        return compressImageFile(file, maxBytes);
    }

    for (const dim of [400, 300, 220]) {
        canvas.width = dim;
        canvas.height = dim;
        ctx.clearRect(0, 0, dim, dim);
        ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, dim, dim);

        for (const quality of [0.86, 0.74, 0.6]) {
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/webp", quality),
            );
            if (blob && blob.size <= maxBytes) {
                bitmap.close();
                return new Uint8Array(await blob.arrayBuffer());
            }
        }
    }

    bitmap.close();
    throw new Error("Profile picture could not be compressed.");
}

/**
 * Centre-crops and compresses a profile cover photo into a crisp 3:1 WebP banner.
 */
export async function compressBannerFile(
    file: File,
    maxBytes: number,
): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(file);
    const targetRatio = 3;
    let sw = bitmap.width;
    let sh = bitmap.height;
    let sx = 0;
    let sy = 0;

    if (sw / sh > targetRatio) {
        sw = Math.round(sh * targetRatio);
        sx = Math.floor((bitmap.width - sw) / 2);
    } else {
        sh = Math.round(sw / targetRatio);
        sy = Math.floor((bitmap.height - sh) / 2);
    }

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        bitmap.close();
        return compressImageFile(file, maxBytes);
    }

    for (const width of [1500, 1200, 900]) {
        const height = Math.round(width / targetRatio);
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);

        for (const quality of [0.84, 0.72, 0.58]) {
            const blob = await new Promise<Blob | null>((resolve) =>
                canvas.toBlob(resolve, "image/webp", quality),
            );
            if (blob && blob.size <= maxBytes) {
                bitmap.close();
                return new Uint8Array(await blob.arrayBuffer());
            }
        }
    }

    bitmap.close();
    throw new Error("Cover photo could not be compressed.");
}
