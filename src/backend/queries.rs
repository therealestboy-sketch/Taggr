use crate::env::realms::RealmId;

use super::*;
use candid::Principal;
use env::{
    config::CONFIG,
    memory,
    post::{Post, PostId},
    user::UserId,
    State,
};
use ic_cdk::api::{self, msg_arg_data as arg_data_raw};
use ic_cdk_macros::query;
use serde::Serialize;
use serde_bytes::ByteBuf;

fn caller(state: &State) -> Principal {
    let canonical_principal = api::msg_caller();
    delegations::resolve_delegation(state, canonical_principal).unwrap_or(canonical_principal)
}

fn effective_domain(state: &State, domain: String) -> String {
    if state.domains.contains_key(&domain) {
        domain
    } else {
        "localhost".to_string()
    }
}

#[derive(Serialize)]
struct AppInfo {
    name: &'static str,
    canister_id: String,
    media_bucket: Option<String>,
    is_admin: bool,
    storage_used_bytes: u64,
    storage_quota_bytes: u64,
    max_blob_size_bytes: usize,
    max_spaces_per_user: usize,
    max_posts_per_day: usize,
    max_comments_per_hour: usize,
    users_count: usize,
    posts_count: usize,
    spaces_count: usize,
    domains: Vec<String>,
}

#[export_name = "canister_query app_info"]
fn app_info() {
    read(|state| {
        let p = caller(state);
        let storage_used_bytes = state
            .principal_to_user(p)
            .and_then(|u| state.user_storage_bytes.get(&u.id).copied())
            .unwrap_or(0);
        let users_count = state.users.values().filter(|u| u.organic()).count();
        reply(AppInfo {
            name: CONFIG.name,
            canister_id: id().to_text(),
            media_bucket: state.media_bucket.map(|b| b.to_text()),
            is_admin: state.is_admin(p),
            storage_used_bytes,
            storage_quota_bytes: CONFIG.max_user_storage_bytes,
            max_blob_size_bytes: CONFIG.max_blob_size_bytes,
            max_spaces_per_user: CONFIG.max_spaces_per_user,
            max_posts_per_day: CONFIG.max_posts_per_day,
            max_comments_per_hour: CONFIG.max_comments_per_hour,
            users_count,
            posts_count: state.posts.len(),
            spaces_count: state.realms.len(),
            domains: state.domains.keys().cloned().collect(),
        });
    });
}

#[export_name = "canister_query users_data"]
fn users_data() {
    read(|state| {
        let ids: Vec<UserId> = parse(&arg_data_raw());
        let iter: Box<dyn Iterator<Item = &UserId>> = if ids.is_empty() {
            match state.principal_to_user(caller(state)) {
                Some(user) => Box::new(user.followees.iter().chain(user.followers.iter())),
                _ => Box::new(std::iter::empty()),
            }
        } else {
            Box::new(ids.iter())
        };

        reply(
            iter.filter_map(|id| state.users.get(id))
                .map(|user| (user.id, &user.name))
                .collect::<HashMap<_, _>>(),
        );
    });
}

#[export_name = "canister_query realms"]
fn realms() {
    let realm_ids: Vec<String> = parse(&arg_data_raw());
    mutate(|state| {
        reply(
            realm_ids
                .into_iter()
                .filter_map(|realm_id| {
                    state.realms.remove(&realm_id).map(|mut realm| {
                        realm.num_posts = realm.posts.len();
                        realm.posts.clear();
                        realm
                    })
                })
                .collect::<Vec<_>>(),
        )
    })
}

#[export_name = "canister_query domains"]
fn domains() {
    read(|state| reply(&state.domains))
}

#[export_name = "canister_query all_realms"]
fn all_realms() {
    let page_size = 50;
    let (domain, order, page): (String, String, usize) = parse(&arg_data_raw());
    mutate(|state| {
        let domain = effective_domain(state, domain);
        reply(
            state
                .sorted_realms(domain, order)
                .skip(page * page_size)
                .take(page_size)
                .collect::<Vec<_>>(),
        );
    })
}

#[export_name = "canister_query user_posts"]
fn user_posts() {
    let (domain, handle, page, offset): (String, String, usize, PostId) = parse(&arg_data_raw());
    read(|state| {
        let domain = effective_domain(state, domain);
        resolve_handle(state, Some(&handle)).map(|user| {
            reply(
                user.posts(Some(&domain), state, offset, true)
                    .filter(|post| !post.is_deleted())
                    .skip(CONFIG.feed_page_size * page)
                    .take(CONFIG.feed_page_size)
                    .map(|post| post.with_meta(state))
                    .collect::<Vec<_>>(),
            )
        })
    });
}

#[export_name = "canister_query user_tags"]
fn user_tags() {
    let (domain, handle, page, offset): (String, String, usize, PostId) = parse(&arg_data_raw());
    let tag = format!("@{}", handle);
    read(|state| {
        let domain = effective_domain(state, domain);
        reply(
            state
                .last_posts(domain, None, offset, 0, false)
                .filter(|post| post.body.contains(&tag))
                .skip(CONFIG.feed_page_size * page)
                .take(CONFIG.feed_page_size)
                .map(|post| post.with_meta(state))
                .collect::<Vec<_>>(),
        )
    });
}

#[export_name = "canister_query user"]
fn user() {
    let (domain, input): (String, Vec<String>) = parse(&arg_data_raw());
    let own_profile_fetch = input.is_empty();
    mutate(|state| {
        let domain = effective_domain(state, domain);
        let handle = input.into_iter().next();
        let user_id = match resolve_handle(state, handle.as_ref()) {
            Some(value) => value.id,
            _ => return reply(None as Option<User>),
        };
        let user = state.users.get_mut(&user_id).expect("user not found");
        user.num_posts = user.posts.len();
        user.posts.clear();
        if own_profile_fetch {
            user.accounting.clear();
        } else {
            user.bookmarks.clear();
            user.notifications.clear();
        }
        if let Some(cfg) = state.domains.get(&domain) {
            user.realms.retain(|id| cfg.realm_visible(id));
            user.controlled_realms.retain(|id| cfg.realm_visible(id));
        }
        reply(user);
    });
}

fn personal_filter(
    state: &State,
    realm: Option<&RealmId>,
    user: Option<&User>,
    post: &Post,
) -> bool {
    user.map(|user| user.should_see(state, realm, post))
        .unwrap_or(true)
}

#[export_name = "canister_query posts"]
fn posts() {
    let ids: Vec<PostId> = parse(&arg_data_raw());
    read(|state| {
        reply(
            ids.into_iter()
                .filter_map(|id| Post::get(state, &id))
                .filter(|post| !post.is_deleted() && !state.is_user_banned(post.user))
                .map(|post| post.with_meta(state))
                .collect::<Vec<_>>(),
        );
    })
}

#[export_name = "canister_query hot_posts"]
fn hot_posts() {
    let (domain, realm, page, offset, filtered): (String, String, usize, PostId, bool) =
        parse(&arg_data_raw());
    let realm = optional(realm);
    read(|state| {
        let domain = effective_domain(state, domain);
        let user = state.principal_to_user(caller(state));
        reply(
            state
                .hot_posts(domain, realm.as_ref(), offset)
                .filter(|post| !filtered || personal_filter(state, realm.as_ref(), user, post))
                .skip(CONFIG.feed_page_size * page)
                .take(CONFIG.feed_page_size)
                .map(|post| post.with_meta(state))
                .collect::<Vec<_>>(),
        )
    });
}

#[export_name = "canister_query last_posts"]
fn last_posts() {
    let (domain, realm, page, offset, filtered): (String, String, usize, PostId, bool) =
        parse(&arg_data_raw());
    let realm = optional(realm);
    read(|state| {
        let domain = effective_domain(state, domain);
        let user = state.principal_to_user(caller(state));
        reply(
            state
                .last_posts(domain, realm.as_ref(), offset, 0, false)
                .filter(|post| !filtered || personal_filter(state, realm.as_ref(), user, post))
                .skip(CONFIG.feed_page_size * page)
                .take(CONFIG.feed_page_size)
                .map(|post| post.with_meta(state))
                .collect::<Vec<_>>(),
        )
    });
}

#[export_name = "canister_query posts_by_tags"]
fn posts_by_tags() {
    let (domain, realm, tags_and_users, page, offset): (
        String,
        String,
        Vec<String>,
        usize,
        PostId,
    ) = parse(&arg_data_raw());
    read(|state| {
        let domain = effective_domain(state, domain);
        reply(
            state
                .posts_by_tags_and_users(&domain, optional(realm), offset, &tags_and_users, false)
                .filter(|post| !post.is_deleted() && !state.is_user_banned(post.user))
                .skip(CONFIG.feed_page_size * page)
                .take(CONFIG.feed_page_size)
                .map(|post| post.with_meta(state))
                .collect::<Vec<_>>(),
        )
    });
}

#[export_name = "canister_query personal_feed"]
fn personal_feed() {
    let (domain, page, offset): (String, usize, PostId) = parse(&arg_data_raw());
    read(|state| {
        let domain = effective_domain(state, domain);
        reply(match state.principal_to_user(caller(state)) {
            None => Default::default(),
            Some(user) => user
                .personal_feed(domain, state, offset)
                .filter(|post| !post.is_deleted() && !state.is_user_banned(post.user))
                .skip(CONFIG.feed_page_size * page)
                .take(CONFIG.feed_page_size)
                .map(|post| post.with_meta(state))
                .collect::<Vec<_>>(),
        })
    });
}

#[export_name = "canister_query thread"]
fn thread() {
    let id: PostId = parse(&arg_data_raw());
    read(|state| {
        reply(
            state
                .thread(id)
                .filter_map(|id| Post::get(state, &id))
                .filter(|post| !state.is_user_banned(post.user))
                .map(|post| post.with_meta(state))
                .collect::<Vec<_>>(),
        )
    })
}

#[export_name = "canister_query recent_tags"]
fn recent_tags() {
    let (domain, realm, n): (String, String, usize) = parse(&arg_data_raw());
    let realm = optional(realm);
    read(|state| {
        let domain = effective_domain(state, domain);
        reply(state.recent_tags(domain, realm.as_ref(), n))
    });
}

#[export_name = "canister_query validate_username"]
fn validate_username() {
    let name: String = parse(&arg_data_raw());
    read(|state| reply(state.validate_username(&name)));
}

#[export_name = "canister_query config"]
fn config() {
    reply(CONFIG);
}

#[export_name = "canister_query stats"]
fn stats() {
    read(|state| reply(state.stats(api::time())));
}

#[export_name = "canister_query search"]
fn search() {
    let (domain, query): (String, String) = parse(&arg_data_raw());
    read(|state| {
        let domain = effective_domain(state, domain);
        reply(env::search::search(domain, state, query))
    });
}

#[export_name = "canister_query realm_search"]
fn realm_search() {
    let (domain, order, query): (String, String, String) = parse(&arg_data_raw());
    mutate(|state| {
        let domain = effective_domain(state, domain);
        let ids = state
            .sorted_realms(domain, order)
            .map(|(id, _)| id.clone())
            .collect::<Vec<_>>();
        reply(env::search::realm_search(state, ids, query))
    })
}

#[query]
fn stable_mem_read(page: u64) -> Vec<(u64, Blob)> {
    let offset = page * BACKUP_PAGE_SIZE as u64;
    let (heap_off, heap_size) = memory::heap_address();
    let memory_end = heap_off + heap_size;
    if offset > memory_end {
        return Default::default();
    }
    let chunk_size = (BACKUP_PAGE_SIZE as u64).min(memory_end - offset) as usize;
    let mut buf = Vec::with_capacity(chunk_size);
    buf.spare_capacity_mut();
    unsafe {
        buf.set_len(chunk_size);
    }
    api::stable_read(offset, &mut buf);
    vec![(page, ByteBuf::from(buf))]
}

fn resolve_handle<'a>(state: &'a State, handle: Option<&'a String>) -> Option<&'a User> {
    match handle {
        Some(handle) => state.user(handle),
        None => Some(state.principal_to_user(caller(state))?),
    }
}
