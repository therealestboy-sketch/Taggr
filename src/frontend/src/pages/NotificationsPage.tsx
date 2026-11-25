import React from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useApp } from "../app-context";
import { navigate } from "../router";
import { ApiResult, Notification } from "../types";

function renderNotificationCopy(notif: Notification): {
    text: string;
    target?: string;
} {
    if ("NewPost" in notif) {
        const [summary, postId] = notif.NewPost;
        return { text: summary, target: `/post/${postId}` };
    }
    if ("WatchedPostEntries" in notif) {
        const [postId, entries] = notif.WatchedPostEntries;
        return {
            text: `${entries.length} new ${entries.length === 1 ? "reply" : "replies"} on post #${postId}`,
            target: `/post/${postId}`,
        };
    }
    if ("Generic" in notif) {
        return { text: notif.Generic };
    }
    if ("Conditional" in notif) {
        return { text: notif.Conditional[0] };
    }
    return { text: "Notification" };
}

export const NotificationsPage: React.FC = () => {
    const { api, user, signIn, refreshUser, toast } = useApp();

    if (!user) {
        return (
            <div>
                <div className="sticky top-0 z-20 ui-glass border-b ui-border px-4 py-3">
                    <h1 className="font-bold text-base">Notifications</h1>
                </div>
                <div className="py-14 px-6 text-center space-y-3">
                    <p className="text-sm ui-text-secondary">
                        Sign in to see replies, mentions, and new followers.
                    </p>
                    <button
                        type="button"
                        onClick={signIn}
                        className="px-4 py-2 rounded-full ui-accent-bg text-xs font-semibold cursor-pointer"
                    >
                        Sign in with Passkey
                    </button>
                </div>
            </div>
        );
    }

    const entries = Object.entries(user.notifications || {})
        .map(([id, pair]) => ({
            id: Number(id),
            notification: pair[0],
            unread: pair[1],
        }))
        .sort((a, b) => b.id - a.id);

    const unreadIds = entries.filter((e) => e.unread).map((e) => e.id);

    const handleMarkAllRead = async () => {
        if (unreadIds.length === 0) return;
        const res = await api.call<ApiResult<null>>(
            "clear_notifications",
            unreadIds,
        );
        if (res && "Err" in res) {
            toast(res.Err, "error");
            return;
        }
        await refreshUser();
        toast("All notifications marked as read");
    };

    const handleClickItem = async (
        id: number,
        unread: boolean,
        target?: string,
    ) => {
        if (unread) {
            await api.call("clear_notifications", [id]);
            await refreshUser();
        }
        if (target) navigate(target);
    };

    return (
        <div>
            <div className="sticky top-0 z-20 ui-glass border-b ui-border px-4 py-3 flex items-center justify-between">
                <h1 className="font-bold text-base">Notifications</h1>
                {unreadIds.length > 0 && (
                    <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-xs ui-accent-text hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Mark all read</span>
                    </button>
                )}
            </div>

            {entries.length === 0 ? (
                <div className="py-14 px-6 text-center space-y-2">
                    <Bell className="w-6 h-6 mx-auto ui-text-muted opacity-60" />
                    <p className="text-sm ui-text-muted">
                        You are all caught up.
                    </p>
                </div>
            ) : (
                <div className="divide-y ui-border">
                    {entries.map((item) => {
                        const { text, target } = renderNotificationCopy(
                            item.notification,
                        );
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() =>
                                    handleClickItem(
                                        item.id,
                                        item.unread,
                                        target,
                                    )
                                }
                                className={`w-full px-4 py-3.5 text-left flex items-start gap-3 ui-hover transition cursor-pointer ${
                                    item.unread ? "ui-surface" : ""
                                }`}
                            >
                                <span
                                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                                        item.unread
                                            ? "ui-accent-bg"
                                            : "bg-transparent"
                                    }`}
                                />
                                <span
                                    className={`text-sm leading-relaxed ${
                                        item.unread
                                            ? "font-medium ui-text"
                                            : "ui-text-secondary"
                                    }`}
                                >
                                    {text}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
