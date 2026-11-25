import React, { useState } from "react";
import { X } from "lucide-react";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { navigate } from "../router";
import { ApiResult } from "../types";

export const CreateSpaceModal: React.FC = () => {
    const {
        api,
        user,
        appInfo,
        createSpaceOpen,
        setCreateSpaceOpen,
        refreshUser,
        refreshDiscovery,
        toast,
    } = useApp();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!createSpaceOpen || !user) return null;

    const maxSpaces = appInfo?.max_spaces_per_user ?? 3;
    const createdCount = user.controlled_realms.length;
    const atLimit = !appInfo?.is_admin && createdCount >= maxSpaces;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleaned = name
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9_-]/g, "");
        if (!cleaned) {
            setError(`Please enter a ${BRAND.communitySingular} name.`);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const payload = {
                cleanup_penalty: 0,
                controllers: [user.id],
                description: description.trim(),
                filter: {
                    age_days: 0,
                    safe: false,
                    balance: 0,
                    num_followers: 0,
                },
                label_color: BRAND.accent.main,
                last_setting_update: 0,
                last_update: 0,
                logo: "",
                max_downvotes: 1000,
                num_members: 1,
                num_posts: 0,
                revenue: 0,
                theme: "",
                whitelist: [],
                created: 0,
                posts: [],
                adult_content: false,
                comments_filtering: false,
            };
            const res = await api.call<ApiResult<null>>(
                "create_realm",
                cleaned,
                payload,
            );
            if (!res) {
                setError("Request failed. Please try again.");
            } else if ("Err" in res) {
                setError(res.Err);
            } else {
                await Promise.all([refreshUser(), refreshDiscovery()]);
                setName("");
                setDescription("");
                setCreateSpaceOpen(false);
                toast(`Created ${cleaned}`);
                navigate(`/space/${cleaned}`);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setCreateSpaceOpen(false)}
        >
            <form
                onSubmit={handleSubmit}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-2xl border ui-border-strong ui-surface p-5 space-y-4 shadow-2xl"
            >
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base ui-text">
                        Create a {BRAND.communitySingular}
                    </h3>
                    <button
                        type="button"
                        onClick={() => setCreateSpaceOpen(false)}
                        className="p-1.5 rounded-full ui-hover ui-text-muted cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-xs ui-text-secondary leading-relaxed">
                    Start a topic community for discussions and media. You have
                    created{" "}
                    <span className="font-semibold ui-text">
                        {createdCount}
                    </span>{" "}
                    of {appInfo?.is_admin ? "unlimited (admin)" : maxSpaces}{" "}
                    {BRAND.communityPlural}.
                </p>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium ui-text-secondary mb-1">
                            {BRAND.communitySingular} name
                        </label>
                        <input
                            type="text"
                            maxLength={25}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. DESIGN"
                            className="w-full rounded-xl ui-surface-2 border ui-border px-3.5 py-2 text-sm ui-text uppercase focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium ui-text-secondary mb-1">
                            Description
                        </label>
                        <textarea
                            rows={3}
                            maxLength={400}
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What is this Space about?"
                            className="w-full rounded-xl ui-surface-2 border ui-border px-3.5 py-2 text-sm ui-text focus:outline-none resize-none"
                        />
                    </div>
                </div>

                {error && (
                    <p
                        className="text-xs"
                        style={{ color: "var(--ui-danger)" }}
                    >
                        {error}
                    </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                    <button
                        type="button"
                        onClick={() => setCreateSpaceOpen(false)}
                        className="px-4 py-2 rounded-full text-xs font-medium ui-pill ui-text-secondary cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={submitting || atLimit || !name.trim()}
                        className="px-4 py-2 rounded-full text-xs font-semibold ui-accent-bg disabled:opacity-50 cursor-pointer"
                    >
                        {submitting
                            ? "Creating..."
                            : `Create ${BRAND.communitySingular}`}
                    </button>
                </div>
            </form>
        </div>
    );
};
