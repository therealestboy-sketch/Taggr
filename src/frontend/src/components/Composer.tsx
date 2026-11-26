import React, { useMemo, useRef, useState } from "react";
import {
    BarChart3,
    Bold,
    Code,
    Eye,
    Image as ImageIcon,
    Italic,
    Link2,
    Loader2,
    PenLine,
    Upload,
    X,
} from "lucide-react";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import Markdown from "../markdown-react";
import { PostId, SpaceId } from "../types";
import { compressImageFile, formatBytes } from "../utils";
import { Avatar } from "./Avatar";

const MAX_POST_LENGTH = 10_000;
const MAX_IMAGES = 4;

type UploadedRef = {
    blobId: string;
    offset: number;
    len: number;
    previewUrl: string;
};

type AutocompleteState = {
    kind: "@" | "#";
    query: string;
    start: number;
    end: number;
};

type ComposerProps = {
    defaultSpace?: SpaceId | null;
    parentId?: PostId;
    repostId?: PostId;
    placeholder?: string;
    compact?: boolean;
    autoFocus?: boolean;
    noBorder?: boolean;
    onPublished?: (postId: PostId) => void;
};

export const Composer: React.FC<ComposerProps> = ({
    defaultSpace = null,
    parentId,
    repostId,
    placeholder,
    compact = false,
    autoFocus = false,
    noBorder = false,
    onPublished,
}) => {
    const {
        api,
        user,
        appInfo,
        spaces,
        trendingTags,
        suggestedUsers,
        usersData,
        refreshUser,
        bumpFeed,
        toast,
    } = useApp();

    const [text, setText] = useState("");
    const [space, setSpace] = useState<string>(defaultSpace || "");
    const [pollOpen, setPollOpen] = useState(false);
    const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
    const [pollDeadlineHours, setPollDeadlineHours] = useState(48);
    const [uploads, setUploads] = useState<UploadedRef[]>([]);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [previewMode, setPreviewMode] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [autocomplete, setAutocomplete] = useState<AutocompleteState | null>(
        null,
    );
    const [activeIdx, setActiveIdx] = useState(0);

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const knownHandles = useMemo(() => {
        const set = new Set<string>();
        Object.values(usersData).forEach((name) => {
            if (name) set.add(name);
        });
        suggestedUsers.forEach((u) => {
            if (u.name) set.add(u.name);
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [usersData, suggestedUsers]);

    const suggestions = useMemo(() => {
        if (!autocomplete) return [];
        const q = autocomplete.query.toLowerCase();
        if (autocomplete.kind === "@") {
            return knownHandles
                .filter((h) => h.toLowerCase().includes(q))
                .slice(0, 6);
        }
        return trendingTags
            .map(([t]) => t)
            .filter((t) => t.toLowerCase().includes(q))
            .slice(0, 6);
    }, [autocomplete, knownHandles, trendingTags]);

    if (!user) {
        return null;
    }

    const uploadFiles = async (fileList: File[]) => {
        const imageFiles = fileList.filter((f) => f.type.startsWith("image/"));
        if (imageFiles.length === 0) return;
        if (!appInfo?.media_bucket) {
            toast(
                "Shared media storage is not configured yet (set it in Settings → Admin).",
                "error",
            );
            return;
        }
        const remaining = MAX_IMAGES - uploads.length;
        if (remaining <= 0) {
            toast(
                `You can attach up to ${MAX_IMAGES} images per post.`,
                "error",
            );
            return;
        }
        const batch = imageFiles.slice(0, remaining);
        setUploading(true);
        try {
            const maxBytes = appInfo.max_blob_size_bytes || 512 * 1024;
            let attachedCount = 0;
            for (const file of batch) {
                const bytes = await compressImageFile(file, maxBytes);
                const res = await api.upload_media(bytes);
                if (!res) {
                    toast("Media upload failed.", "error");
                    continue;
                }
                if ("Err" in res && res.Err) {
                    toast(res.Err, "error");
                    continue;
                }
                if (res.Ok) {
                    const [blobId, offset, len] = res.Ok;
                    const previewUrl = URL.createObjectURL(
                        new Blob([new Uint8Array(bytes)], {
                            type: "image/webp",
                        }),
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
                    attachedCount += 1;
                }
            }
            if (attachedCount > 0) {
                await refreshUser();
                toast(
                    attachedCount === 1
                        ? "Image attached"
                        : `${attachedCount} images attached`,
                );
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

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        e.target.value = "";
        if (files.length > 0) {
            await uploadFiles(files);
        }
    };

    const handlePaste = async (
        e: React.ClipboardEvent<HTMLTextAreaElement>,
    ) => {
        const items = Array.from(e.clipboardData?.items || []);
        const files: File[] = [];
        for (const item of items) {
            if (item.kind === "file" && item.type.startsWith("image/")) {
                const f = item.getAsFile();
                if (f) files.push(f);
            }
        }
        if (files.length > 0) {
            e.preventDefault();
            await uploadFiles(files);
        }
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragActive(false);
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length > 0) {
            await uploadFiles(files);
        }
    };

    const removeUpload = (blobId: string) => {
        setUploads((prev) => {
            const target = prev.find((u) => u.blobId === blobId);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return prev.filter((u) => u.blobId !== blobId);
        });
    };

    const updateAutocomplete = (value: string, cursor: number) => {
        const before = value.slice(0, cursor);
        const match = before.match(/(^|[\s(])([@#])([A-Za-z0-9_-]{0,24})$/);
        if (match) {
            const kind = match[2] as "@" | "#";
            const query = match[3];
            const start = cursor - query.length - 1;
            setAutocomplete({ kind, query, start, end: cursor });
            setActiveIdx(0);
        } else {
            setAutocomplete(null);
        }
    };

    const applyAutocomplete = (item: string) => {
        if (!autocomplete) return;
        const insertion = `${autocomplete.kind}${item} `;
        const next =
            text.slice(0, autocomplete.start) +
            insertion +
            text.slice(autocomplete.end);
        setText(next);
        setAutocomplete(null);
        const nextPos = autocomplete.start + insertion.length;
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (el) {
                el.focus();
                el.setSelectionRange(nextPos, nextPos);
            }
        });
    };

    const wrapSelection = (before: string, after: string, fallback: string) => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const selected = text.slice(start, end) || fallback;
        const next =
            text.slice(0, start) + before + selected + after + text.slice(end);
        setText(next);
        setPreviewMode(false);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(
                start + before.length,
                start + before.length + selected.length,
            );
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (autocomplete && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIdx((i) => (i + 1) % suggestions.length);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIdx(
                    (i) => (i - 1 + suggestions.length) % suggestions.length,
                );
                return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                applyAutocomplete(suggestions[activeIdx] || suggestions[0]);
                return;
            }
            if (e.key === "Escape") {
                e.preventDefault();
                setAutocomplete(null);
                return;
            }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            if (!submitting && !uploading) {
                handlePublish();
            }
        }
    };

    const handlePublish = async () => {
        const trimmed = text.trim();
        if (!trimmed && uploads.length === 0 && !repostId) {
            toast("Write something or attach an image first.", "error");
            return;
        }
        if (trimmed.length > MAX_POST_LENGTH) {
            toast(
                `Post is too long (maximum ${MAX_POST_LENGTH.toLocaleString()} characters).`,
                "error",
            );
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
                setPreviewMode(false);
                setAutocomplete(null);
                toast(
                    parentId !== undefined
                        ? "Reply posted"
                        : repostId !== undefined
                          ? "Quote posted"
                          : "Published",
                );
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
    const charCount = text.length;
    const overLimit = charCount > MAX_POST_LENGTH;
    const nearLimit = charCount > MAX_POST_LENGTH * 0.85;

    return (
        <div
            onDragOver={(e) => {
                e.preventDefault();
                if (!dragActive) setDragActive(true);
            }}
            onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragActive(false);
                }
            }}
            onDrop={handleDrop}
            className={`relative px-4 ${compact ? "py-3" : "py-3.5"} ${
                noBorder ? "" : "border-b ui-border"
            } transition ${dragActive ? "ui-accent-soft" : ""}`}
        >
            {dragActive && (
                <div className="pointer-events-none absolute inset-2 z-10 rounded-2xl border-2 border-dashed border-[var(--ui-accent)] flex items-center justify-center gap-2 text-xs font-semibold ui-accent-text backdrop-blur-[2px]">
                    <Upload className="w-4 h-4" />
                    <span>Drop images to attach (up to {MAX_IMAGES})</span>
                </div>
            )}

            <div className="flex gap-3">
                <Avatar
                    name={user.name}
                    avatarRef={user.settings?.avatar}
                    size="lg"
                />

                <div className="flex-1 min-w-0 space-y-2.5">
                    {/* Write / Preview Switcher (shown once user types or toggles preview) */}
                    {(text.length > 0 || previewMode) && (
                        <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-center rounded-full ui-pill p-0.5 text-[11px]">
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode(false)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full transition cursor-pointer ${
                                        !previewMode
                                            ? "ui-surface ui-text font-semibold shadow-xs"
                                            : "ui-text-muted"
                                    }`}
                                >
                                    <PenLine className="w-3 h-3" />
                                    <span>Write</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPreviewMode(true)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full transition cursor-pointer ${
                                        previewMode
                                            ? "ui-surface ui-text font-semibold shadow-xs"
                                            : "ui-text-muted"
                                    }`}
                                >
                                    <Eye className="w-3 h-3" />
                                    <span>Preview</span>
                                </button>
                            </div>

                            {!previewMode && (
                                <div className="flex items-center gap-0.5">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            wrapSelection("**", "**", "bold")
                                        }
                                        className="p-1.5 rounded-lg ui-hover ui-text-muted hover:ui-text cursor-pointer"
                                        title="Bold"
                                    >
                                        <Bold className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            wrapSelection("*", "*", "italic")
                                        }
                                        className="p-1.5 rounded-lg ui-hover ui-text-muted hover:ui-text cursor-pointer"
                                        title="Italic"
                                    >
                                        <Italic className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            wrapSelection("`", "`", "code")
                                        }
                                        className="p-1.5 rounded-lg ui-hover ui-text-muted hover:ui-text cursor-pointer"
                                        title="Inline code"
                                    >
                                        <Code className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            wrapSelection(
                                                "[",
                                                "](https://)",
                                                "link text",
                                            )
                                        }
                                        className="p-1.5 rounded-lg ui-hover ui-text-muted hover:ui-text cursor-pointer"
                                        title="Insert link"
                                    >
                                        <Link2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Editor or Preview */}
                    <div className="relative">
                        {previewMode ? (
                            <div className="min-h-[72px] rounded-xl ui-surface border ui-border px-3 py-2.5 post-markdown text-[14.5px] leading-relaxed ui-text break-words">
                                {text.trim() ? (
                                    <Markdown>{text}</Markdown>
                                ) : (
                                    <span className="text-sm ui-text-muted">
                                        Nothing to preview yet.
                                    </span>
                                )}
                            </div>
                        ) : (
                            <textarea
                                ref={textareaRef}
                                id={
                                    parentId || repostId
                                        ? undefined
                                        : "composer-textarea"
                                }
                                autoFocus={autoFocus}
                                rows={compact ? 2 : 3}
                                value={text}
                                onChange={(e) => {
                                    setText(e.target.value);
                                    updateAutocomplete(
                                        e.target.value,
                                        e.target.selectionStart,
                                    );
                                }}
                                onKeyDown={handleKeyDown}
                                onPaste={handlePaste}
                                onBlur={() =>
                                    setTimeout(() => setAutocomplete(null), 150)
                                }
                                placeholder={
                                    placeholder ||
                                    "What's happening? Paste or drop images, use Markdown, #tags, or @mentions..."
                                }
                                className="w-full bg-transparent text-[15px] ui-text placeholder:opacity-55 focus:outline-none resize-y leading-relaxed"
                            />
                        )}

                        {/* @mention / #hashtag Autocomplete Popover */}
                        {autocomplete &&
                            suggestions.length > 0 &&
                            !previewMode && (
                                <div className="absolute left-0 top-full mt-1 w-56 rounded-xl border ui-border-strong ui-surface shadow-xl py-1 z-30">
                                    <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider ui-text-muted">
                                        {autocomplete.kind === "@"
                                            ? "Mention user"
                                            : "Trending hashtags"}
                                    </div>
                                    {suggestions.map((item, idx) => (
                                        <button
                                            key={item}
                                            type="button"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                applyAutocomplete(item);
                                            }}
                                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-1.5 cursor-pointer transition ${
                                                idx === activeIdx
                                                    ? "ui-accent-soft font-semibold"
                                                    : "ui-text ui-hover"
                                            }`}
                                        >
                                            <span className="ui-text-muted">
                                                {autocomplete.kind}
                                            </span>
                                            <span className="truncate">
                                                {item}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                    </div>

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
                                        aria-label="Remove image"
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
                                multiple
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                            <button
                                type="button"
                                disabled={
                                    uploading || uploads.length >= MAX_IMAGES
                                }
                                onClick={() => fileInputRef.current?.click()}
                                className="p-2 rounded-full ui-hover ui-text-secondary transition cursor-pointer disabled:opacity-40"
                                title={`Attach images (${uploads.length}/${MAX_IMAGES} · ${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)} used)`}
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
                            {charCount > 0 && (
                                <span
                                    className={`text-[11px] tabular-nums ${
                                        overLimit
                                            ? "font-semibold"
                                            : nearLimit
                                              ? "text-amber-500 font-medium"
                                              : "ui-text-muted"
                                    }`}
                                    style={
                                        overLimit
                                            ? { color: "var(--ui-danger)" }
                                            : undefined
                                    }
                                    title="Press Ctrl+Enter / Cmd+Enter to post"
                                >
                                    {charCount.toLocaleString()} /{" "}
                                    {MAX_POST_LENGTH.toLocaleString()}
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={handlePublish}
                                disabled={
                                    submitting ||
                                    uploading ||
                                    overLimit ||
                                    (!text.trim() &&
                                        uploads.length === 0 &&
                                        !repostId)
                                }
                                className="px-4 py-1.5 rounded-full ui-accent-bg text-xs font-semibold disabled:opacity-50 transition cursor-pointer"
                                title="Shortcut: Ctrl+Enter / Cmd+Enter"
                            >
                                {submitting
                                    ? "Posting..."
                                    : parentId !== undefined
                                      ? "Reply"
                                      : repostId !== undefined
                                        ? "Quote"
                                        : "Post"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
