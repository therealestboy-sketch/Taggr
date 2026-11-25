import React, { useRef, useState } from "react";
import { BarChart3, Image as ImageIcon, Loader2, X } from "lucide-react";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { PostId, SpaceId } from "../types";
import { compressImageFile, formatBytes } from "../utils";
import { Avatar } from "./Avatar";

type UploadedRef = {
    blobId: string;
    offset: number;
    len: number;
    previewUrl: string;
};

type ComposerProps = {
    defaultSpace?: SpaceId | null;
    parentId?: PostId;
    repostId?: PostId;
    placeholder?: string;
    compact?: boolean;
    onPublished?: (postId: PostId) => void;
};

export const Composer: React.FC<ComposerProps> = ({
    defaultSpace = null,
    parentId,
    repostId,
    placeholder,
    compact = false,
    onPublished,
}) => {
    const { api, user, appInfo, spaces, refreshUser, bumpFeed, toast } =
        useApp();
    const [text, setText] = useState("");
    const [space, setSpace] = useState<string>(defaultSpace || "");
    const [pollOpen, setPollOpen] = useState(false);
    const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
    const [pollDeadlineHours, setPollDeadlineHours] = useState(48);
    const [uploads, setUploads] = useState<UploadedRef[]>([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    if (!user) {
        return null;
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        if (!appInfo?.media_bucket) {
            toast(
                "Shared media storage is not configured yet (set it in Settings → Admin).",
                "error",
            );
            return;
        }
        setUploading(true);
        try {
            const maxBytes = appInfo.max_blob_size_bytes || 512 * 1024;
            const bytes = await compressImageFile(file, maxBytes);
            const res = await api.upload_media(bytes);
            if (!res) {
                toast("Media upload failed.", "error");
            } else if ("Err" in res && res.Err) {
                toast(res.Err, "error");
            } else if (res.Ok) {
                const [blobId, offset, len] = res.Ok;
                const previewUrl = URL.createObjectURL(
                    new Blob([new Uint8Array(bytes)], { type: "image/webp" }),
                );
                setUploads((prev) => [
                    ...prev,
                    {
                        blobId,
                        offset: Number(offset),
                        len: Number(len),
                        previewUrl,
                    },
                ]);
                await refreshUser();
                toast("Image attached");
            }
        } catch (err) {
            toast(
                err instanceof Error ? err.message : "Image upload failed",
                "error",
            );
        } finally {
            setUploading(false);
        }
    };

    const removeUpload = (blobId: string) => {
        setUploads((prev) => {
            const target = prev.find((u) => u.blobId === blobId);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return prev.filter((u) => u.blobId !== blobId);
        });
    };

    const handlePublish = async () => {
        const trimmed = text.trim();
        if (!trimmed && uploads.length === 0 && !repostId) {
            toast("Write something or attach an image first.", "error");
            return;
        }

        let body = trimmed;
        for (const u of uploads) {
            const marker = `![](/blob/${u.blobId})`;
            if (!body.includes(marker)) {
                body = body ? `${body}\n\n${marker}` : marker;
            }
        }

        const refs: [string, number, number][] = uploads.map((u) => [
            u.blobId,
            u.offset,
            u.len,
        ]);

        let extensionArg: Uint8Array[] = [];
        if (repostId !== undefined) {
            extensionArg = [
                new TextEncoder().encode(JSON.stringify({ Repost: repostId })),
            ];
        } else if (pollOpen) {
            const cleanOpts = pollOptions.map((o) => o.trim()).filter(Boolean);
            if (cleanOpts.length < 2) {
                toast("Please add at least 2 poll options.", "error");
                return;
            }
            const pollPayload = {
                Poll: {
                    options: cleanOpts,
                    votes: {},
                    voters: [],
                    deadline: pollDeadlineHours,
                    weighted_by_karma: {},
                    weighted_by_tokens: {},
                },
            };
            extensionArg = [
                new TextEncoder().encode(JSON.stringify(pollPayload)),
            ];
        }

        const effectiveSpace = parentId ? "" : space || defaultSpace || "";

        setSubmitting(true);
        try {
            const res = await api.add_post(
                body,
                refs,
                parentId !== undefined ? [parentId] : [],
                effectiveSpace ? [effectiveSpace] : [],
                extensionArg,
            );
            if (!res) {
                toast("Failed to publish post.", "error");
            } else if ("Err" in res && res.Err) {
                toast(res.Err, "error");
            } else if (res.Ok !== undefined) {
                uploads.forEach((u) => URL.revokeObjectURL(u.previewUrl));
                setText("");
                setUploads([]);
                setPollOpen(false);
                setPollOptions(["", ""]);
                toast(parentId !== undefined ? "Reply posted" : "Published");
                bumpFeed();
                onPublished?.(res.Ok);
            }
        } catch (err) {
            toast(
                err instanceof Error ? err.message : "Could not publish post",
                "error",
            );
        } finally {
            setSubmitting(false);
        }
    };

    const usedBytes = appInfo?.storage_used_bytes ?? 0;
    const quotaBytes = appInfo?.storage_quota_bytes ?? 50 * 1024 * 1024;

    return (
        <div
            className={`px-4 ${compact ? "py-3" : "py-3.5"} border-b ui-border`}
        >
            <div className="flex gap-3">
                <Avatar
                    name={user.name}
                    avatarRef={user.settings?.avatar}
                    size="lg"
                />

                <div className="flex-1 min-w-0 space-y-2.5">
                    <textarea
                        id={parentId ? undefined : "composer-textarea"}
                        rows={compact ? 2 : 3}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={
                            placeholder ||
                            "What's happening? Markdown, #hashtags, and polls supported..."
                        }
                        className="w-full bg-transparent text-[15px] ui-text placeholder:opacity-55 focus:outline-none resize-none leading-relaxed"
                    />

                    {/* Attached Images */}
                    {uploads.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {uploads.map((u) => (
                                <div
                                    key={u.blobId}
                                    className="relative group w-24 h-24 rounded-xl overflow-hidden border ui-border"
                                >
                                    <img
                                        src={u.previewUrl}
                                        alt="Attached"
                                        className="w-full h-full object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeUpload(u.blobId)}
                                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-black cursor-pointer"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Poll Builder */}
                    {pollOpen && !repostId && (
                        <div className="rounded-xl ui-surface border ui-border p-3 space-y-2">
                            <div className="flex items-center justify-between text-xs font-medium ui-text-secondary">
                                <span>Poll options</span>
                                <div className="flex items-center gap-3">
                                    <select
                                        value={pollDeadlineHours}
                                        onChange={(e) =>
                                            setPollDeadlineHours(
                                                Number(e.target.value),
                                            )
                                        }
                                        className="rounded-md ui-surface-2 border ui-border px-2 py-0.5 text-xs ui-text focus:outline-none"
                                    >
                                        <option value={24}>24 hours</option>
                                        <option value={48}>2 days</option>
                                        <option value={168}>7 days</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setPollOpen(false)}
                                        className="ui-text-muted hover:underline cursor-pointer"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                            {pollOptions.map((val, idx) => (
                                <input
                                    key={idx}
                                    type="text"
                                    value={val}
                                    onChange={(e) =>
                                        setPollOptions((prev) =>
                                            prev.map((o, i) =>
                                                i === idx ? e.target.value : o,
                                            ),
                                        )
                                    }
                                    placeholder={`Option ${idx + 1}`}
                                    className="w-full rounded-lg ui-surface-2 border ui-border px-2.5 py-1.5 text-xs ui-text focus:outline-none"
                                />
                            ))}
                            {pollOptions.length < 4 && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        setPollOptions((prev) => [...prev, ""])
                                    }
                                    className="text-xs ui-accent-text hover:underline cursor-pointer"
                                >
                                    + Add option
                                </button>
                            )}
                        </div>
                    )}

                    {/* Bottom Toolbar */}
                    <div className="flex items-center justify-between gap-2 pt-1.5 border-t ui-border flex-wrap">
                        <div className="flex items-center gap-1">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <button
                                type="button"
                                disabled={uploading}
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 rounded-full ui-hover ui-text-secondary transition cursor-pointer disabled:opacity-50"
                                title={`Attach image (${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)} used)`}
                            >
                                {uploading ? (
                                    <Loader2 className="w-4 h-4 animate-spin ui-accent-text" />
                                ) : (
                                    <ImageIcon className="w-4 h-4" />
                                )}
                            </button>

                            {!repostId && parentId === undefined && (
                                <button
                                    type="button"
                                    onClick={() => setPollOpen((o) => !o)}
                                    className={`p-2 rounded-full ui-hover transition cursor-pointer ${pollOpen ? "ui-accent-text" : "ui-text-secondary"}`}
                                    title="Add poll"
                                >
                                    <BarChart3 className="w-4 h-4" />
                                </button>
                            )}

                            {parentId === undefined && (
                                <select
                                    value={space || defaultSpace || ""}
                                    onChange={(e) => setSpace(e.target.value)}
                                    className="ml-1 rounded-full ui-pill px-2.5 py-1 text-xs ui-text-secondary focus:outline-none cursor-pointer"
                                    aria-label={`Choose ${BRAND.communitySingular}`}
                                >
                                    <option value="">Main feed</option>
                                    {spaces.map(([id]) => (
                                        <option key={id} value={id}>
                                            {id}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="flex items-center gap-2.5">
                            {uploads.length > 0 && (
                                <span className="text-[11px] ui-text-muted hidden sm:inline">
                                    {formatBytes(usedBytes)} /{" "}
                                    {formatBytes(quotaBytes)}
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={handlePublish}
                                disabled={
                                    submitting ||
                                    uploading ||
                                    (!text.trim() &&
                                        uploads.length === 0 &&
                                        !repostId)
                                }
                                className="px-4 py-1.5 rounded-full ui-accent-bg text-xs font-semibold disabled:opacity-50 transition cursor-pointer"
                            >
                                {submitting
                                    ? "Posting..."
                                    : parentId !== undefined
                                      ? "Reply"
                                      : "Post"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
