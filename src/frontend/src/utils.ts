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
