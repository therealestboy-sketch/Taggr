import React, { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { useApp } from "../app-context";
import { BRAND } from "../brand";
import { navigate } from "../router";
import { ApiResult } from "../types";
import { spaceBadgeStyle } from "../utils";

export const SpacesPage: React.FC = () => {
    const {
        api,
        user,
        appInfo,
        spaces,
        openCreateSpace,
        refreshUser,
        refreshDiscovery,
        toast,
    } = useApp();
    const [filter, setFilter] = useState("");

    const filtered = spaces.filter(([id, sp]) => {
        const q = filter.trim().toLowerCase();
        if (!q) return true;
        return (
            id.toLowerCase().includes(q) ||
            sp.description.toLowerCase().includes(q)
        );
    });

    const handleToggleJoin = async (spaceId: string) => {
        if (!user) {
            toast(`Sign in to join ${BRAND.communityPlural}`, "error");
            return;
        }
        const joined = await api.call<boolean>(
            "toggle_realm_membership",
            spaceId,
        );
        await Promise.all([refreshUser(), refreshDiscovery()]);
        toast(joined ? `Joined ${spaceId}` : `Left ${spaceId}`);
    };

    const handleAdminDelete = async (spaceId: string) => {
        const res = await api.call<ApiResult<null>>(
            "admin_delete_space",
            spaceId,
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        await Promise.all([refreshUser(), refreshDiscovery()]);
        toast(`Removed ${spaceId}`);
    };

    return (
        <div>
            <div className="sticky top-0 z-20 ui-glass border-b ui-border px-4 py-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <h1 className="font-bold text-base">
                            {BRAND.communityPlural}
                        </h1>
                        <p className="text-xs ui-text-muted">
                            Topic communities · Free to create (up to{" "}
                            {appInfo?.max_spaces_per_user ?? 3} per account)
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={openCreateSpace}
                        className="px-3.5 py-1.5 rounded-full ui-accent-bg text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Create {BRAND.communitySingular}</span>
                    </button>
                </div>

                <div className="relative">
                    <Search className="w-4 h-4 ui-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder={`Filter ${BRAND.communityPlural.toLowerCase()}...`}
                        className="w-full rounded-full ui-surface border ui-border pl-10 pr-4 py-2 text-sm ui-text focus:outline-none"
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="py-14 px-6 text-center space-y-2">
                    <p className="text-sm ui-text-secondary">
                        No {BRAND.communityPlural.toLowerCase()} found.
                    </p>
                    <button
                        type="button"
                        onClick={openCreateSpace}
                        className="text-xs ui-accent-text hover:underline cursor-pointer"
                    >
                        Create a new {BRAND.communitySingular}
                    </button>
                </div>
            ) : (
                <div className="divide-y ui-border">
                    {filtered.map(([id, sp]) => {
                        const joined = Boolean(user?.realms?.includes(id));
                        return (
                            <div
                                key={id}
                                className="px-4 py-4 flex items-start justify-between gap-4 ui-hover transition"
                            >
                                <button
                                    type="button"
                                    onClick={() => navigate(`/space/${id}`)}
                                    className="flex items-start gap-3 text-left min-w-0 cursor-pointer"
                                >
                                    <div
                                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-bold shrink-0 shadow-xs"
                                        style={spaceBadgeStyle(
                                            id,
                                            sp.label_color,
                                        )}
                                    >
                                        {id.slice(0, 2)}
                                    </div>
                                    <div className="space-y-0.5 min-w-0">
                                        <div className="font-semibold text-sm ui-text">
                                            {id}
                                        </div>
                                        {sp.description && (
                                            <p className="text-xs ui-text-secondary leading-relaxed">
                                                {sp.description}
                                            </p>
                                        )}
                                        <div className="text-xs ui-text-muted pt-0.5">
                                            {sp.num_members}{" "}
                                            {sp.num_members === 1
                                                ? "member"
                                                : "members"}{" "}
                                            · {sp.num_posts}{" "}
                                            {sp.num_posts === 1
                                                ? "post"
                                                : "posts"}
                                        </div>
                                    </div>
                                </button>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => handleToggleJoin(id)}
                                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                                            joined
                                                ? "ui-pill ui-text-secondary"
                                                : "ui-accent-bg"
                                        }`}
                                    >
                                        {joined ? "Joined" : "Join"}
                                    </button>
                                    {appInfo?.is_admin && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleAdminDelete(id)
                                            }
                                            className="p-1.5 rounded-full ui-hover cursor-pointer"
                                            style={{
                                                color: "var(--ui-danger)",
                                            }}
                                            title="Delete Space (admin)"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
