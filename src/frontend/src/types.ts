export type PostId = number;
export type UserId = number;
export type SpaceId = string;

export type Poll = {
    options: string[];
    votes: { [option: number]: UserId[] };
    voters: UserId[];
    deadline: number;
    weighted_by_karma?: { [key: number]: number };
    weighted_by_tokens?: { [key: number]: number };
};

export type Extension =
    | { Poll: Poll }
    | { Repost: PostId }
    | { Proposal: number }
    | "Feature";

export type UserFilter = {
    age_days: number;
    safe: boolean;
    balance: number;
    num_followers: number;
};

export type Space = {
    comments_filtering: boolean;
    adult_content: boolean;
    created: number;
    cleanup_penalty: number;
    controllers: UserId[];
    description: string;
    filter: UserFilter;
    label_color: string;
    logo: string;
    max_downvotes: number;
    num_members: number;
    num_posts: number;
    theme: string;
    whitelist: UserId[];
    last_update: number;
    last_setting_update: number;
    revenue: number;
    posts: PostId[];
};

export type PostMeta = {
    author_name: string;
    author_avatar?: string;
    author_display_name?: string;
    author_filters: UserFilter;
    viewer_blocked: boolean;
    realm_color: string;
    nsfw: boolean;
    max_downvotes_reached: boolean;
};

export type Post = {
    id: PostId;
    parent?: PostId;
    watchers: UserId[];
    children: PostId[];
    reposts: PostId[];
    user: UserId;
    body: string;
    reactions: { [id: number]: UserId[] };
    files: { [id: string]: [number, number] };
    patches: [number, string][];
    hashes: string[];
    realm?: SpaceId;
    timestamp: number;
    extension?: Extension;
    tree_size: number;
    tree_update: number;
    meta: PostMeta;
    hidden_for: UserId[];
};

export type Notification =
    | { Generic: string }
    | { WatchedPostEntries: [PostId, PostId[]] }
    | { Conditional: [string, unknown] }
    | { NewPost: [string, PostId] };

export type User = {
    name: string;
    id: UserId;
    principal: string;
    about: string;
    bookmarks: PostId[];
    pinned_posts: PostId[];
    last_activity: number;
    settings: { [key: string]: string };
    realms: SpaceId[];
    controlled_realms: SpaceId[];
    followees: UserId[];
    followers: UserId[];
    feeds: string[][];
    timestamp: number;
    num_posts: number;
    blacklist: UserId[];
    notifications: { [key: number]: [Notification, boolean] };
    deactivated: boolean;
    show_posts_in_realms: boolean;
};

export type AppInfo = {
    name: string;
    canister_id: string;
    media_bucket: string | null;
    is_admin: boolean;
    storage_used_bytes: number;
    storage_quota_bytes: number;
    max_blob_size_bytes: number;
    max_spaces_per_user: number;
    max_posts_per_day: number;
    max_comments_per_hour: number;
    users_count: number;
    posts_count: number;
    spaces_count: number;
    domains: string[];
};

export type SearchResult = {
    id: number;
    user_id: number;
    generic_id: string;
    result: "post" | "user" | "tag" | "realm";
    relevant: string;
};

export type UserData = {
    [id: UserId]: string;
};

export type ApiResult<T> = { Ok: T } | { Err: string };
