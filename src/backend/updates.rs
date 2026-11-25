use crate::env::{
    domains::{change_domain_config, DomainConfig},
    realms::{clean_up_realm, Realm, RealmId},
    user::{Mode, UserFilter},
};

use super::*;
use env::{
    config::CONFIG,
    post::{Extension, FileRef, Post, PostId},
    user::{User, UserId},
    State,
};
use ic_cdk::{
    api::{self, msg_arg_data as arg_data_raw},
    call::Call,
    futures::{internals::in_executor_context, spawn},
};
use ic_cdk_macros::{init, post_upgrade, pre_upgrade, update};
use ic_cdk_timers::set_timer_interval;
use serde_bytes::ByteBuf;
use sha2::{Digest, Sha256};
use std::convert::TryInto;
use std::time::Duration;

fn canonical_principal() -> Principal {
    let principal = api::msg_caller();
    assert_ne!(principal, Principal::anonymous(), "authentication required");
    principal
}

pub fn raw_caller(state: &State) -> Result<Principal, String> {
    let principal = canonical_principal();
    if delegations::resolve_delegation(state, principal).is_some() {
        return Err("operation not supported on custom domains".into());
    }
    Ok(principal)
}

fn caller(state: &State) -> Principal {
    let principal = canonical_principal();
    delegations::resolve_delegation(state, principal).unwrap_or(principal)
}

fn is_supported_image(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a])
        || bytes.starts_with(&[0xff, 0xd8, 0xff])
        || bytes.starts_with(b"GIF87a")
        || bytes.starts_with(b"GIF89a")
        || (bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP")
}

#[init]
fn init() {
    let deployer = api::msg_caller();
    mutate(|state| {
        state.memory.init();
        if deployer != Principal::anonymous() {
            state.admins.insert(deployer);
        }
        let now = time();
        state.timers.last_weekly = now;
        state.timers.last_daily = now;
        state.timers.last_hourly = now;
        state.init();
    });
    set_timer_interval(Duration::from_secs(15 * 60), || State::chores(api::time()));
}

#[pre_upgrade]
fn pre_upgrade() {
    mutate(env::memory::heap_to_stable)
}

#[post_upgrade]
fn post_upgrade() {
    let upgrader = api::msg_caller();
    stable_to_heap_core();
    mutate(|state| {
        if state.admins.is_empty() && upgrader != Principal::anonymous() {
            state.admins.insert(upgrader);
        }
    });
    set_timer_interval(Duration::from_secs(15 * 60), || State::chores(api::time()));
    ic_cdk::println!(
        "Post-upgrade spent {}B instructions",
        performance_counter(0) / 1000000000
    );
}

#[cfg(not(feature = "dev"))]
#[update]
fn prod_release() -> bool {
    true
}

/// Uploads a validated image to the shared app-managed media bucket, enforcing
/// per-image size caps, MIME magic bytes, and per-user storage quotas.
#[update]
async fn upload_media(blob: ByteBuf) -> Result<(String, u64, u64), String> {
    let principal = read(caller);
    let len = blob.len() as u64;
    if len == 0 {
        return Err("empty file".into());
    }
    if blob.len() > CONFIG.max_blob_size_bytes {
        return Err(format!(
            "image too large (maximum {} KB)",
            CONFIG.max_blob_size_bytes / 1024
        ));
    }
    if !is_supported_image(&blob) {
        return Err("unsupported image format (PNG, JPEG, GIF, or WebP required)".into());
    }

    let (user_id, bucket) = read(|state| {
        let user = state.principal_to_user(principal).ok_or("user not found")?;
        if user.deactivated {
            return Err("account suspended".to_string());
        }
        let is_admin = state.is_admin(principal);
        let used = state.user_storage_bytes.get(&user.id).copied().unwrap_or(0);
        if !is_admin && used.saturating_add(len) > CONFIG.max_user_storage_bytes {
            return Err(format!(
                "media storage quota reached ({} MB limit)",
                CONFIG.max_user_storage_bytes / (1024 * 1024)
            ));
        }
        let bucket = state
            .media_bucket
            .ok_or("shared media bucket is not configured yet")?;
        Ok((user.id, bucket))
    })?;

    let response = Call::unbounded_wait(bucket, "write")
        .with_raw_args(&blob)
        .await
        .map_err(|err| format!("media upload failed: {:?}", err))?;
    let offset_bytes = response.into_bytes();
    if offset_bytes.len() != 8 {
        return Err("invalid offset returned by media bucket".into());
    }
    let offset = u64::from_be_bytes(offset_bytes.try_into().expect("8 bytes"));

    mutate(|state| {
        *state.user_storage_bytes.entry(user_id).or_default() += len;
    });

    let mut hasher = Sha256::new();
    hasher.update(&blob);
    let hash_hex = hex::encode(hasher.finalize());
    let blob_id = hash_hex[..16].to_string();

    Ok((blob_id, offset, len))
}

#[export_name = "canister_update set_delegation"]
fn set_delegation() {
    let (domain, session_principal): (String, String) = parse(&arg_data_raw());
    reply(mutate(|state| {
        delegations::set_delegation(state, domain, raw_caller(state)?, session_principal, time())
    }))
}

#[export_name = "canister_update set_domain_config"]
fn set_domain_config() {
    let (domain, cfg, command): (String, DomainConfig, String) = parse(&arg_data_raw());
    mutate(|state| {
        reply(change_domain_config(
            state,
            caller(state),
            domain,
            cfg,
            command,
        ))
    })
}

#[export_name = "canister_update vote_on_poll"]
fn vote_on_poll() {
    let (post_id, vote, anonymously): (PostId, u16, bool) = parse(&arg_data_raw());
    mutate(|state| {
        reply(state.vote_on_poll(caller(state), api::time(), post_id, vote, anonymously))
    });
}

#[export_name = "canister_update clear_notifications"]
fn clear_notifications() {
    mutate(|state| {
        let ids: Vec<u64> = parse(&arg_data_raw());
        reply(match state.principal_to_user_mut(caller(state)) {
            Some(user) => {
                user.clear_notifications(ids);
                Ok(())
            }
            None => Err("user not found".to_string()),
        });
    })
}

#[export_name = "canister_update react"]
fn react() {
    let (post_id, reaction): (PostId, u16) = parse(&arg_data_raw());
    mutate(|state| reply(state.react(caller(state), post_id, reaction, api::time())));
}

#[export_name = "canister_update update_last_activity"]
fn update_last_activity() {
    mutate(|state| {
        reply(match state.principal_to_user_mut(caller(state)) {
            Some(user) => {
                user.last_activity = api::time();
                Ok(())
            }
            None => Err("user not found".to_string()),
        });
    });
}

#[export_name = "canister_update update_user"]
fn update_user() {
    let (new_name, about, filter, governance, mode, show_posts_in_realms): (
        String,
        String,
        UserFilter,
        bool,
        Mode,
        bool,
    ) = parse(&arg_data_raw());
    reply(User::update(
        read(caller),
        optional(new_name),
        about,
        filter,
        governance,
        mode,
        show_posts_in_realms,
    ))
}

#[export_name = "canister_update update_user_settings"]
fn update_user_settings() {
    let settings: std::collections::BTreeMap<String, String> = parse(&arg_data_raw());
    reply(User::update_settings(read(caller), settings))
}

#[export_name = "canister_update create_user"]
fn create_user() {
    let (name, invite): (String, String) = parse(&arg_data_raw());
    in_executor_context(|| {
        spawn(async {
            reply(match read(raw_caller) {
                Ok(caller) => user::create_user(caller, name, optional(invite)).await,
                Err(err) => Err(err),
            })
        })
    });
}

#[update]
fn add_post(
    body: String,
    refs: Vec<FileRef>,
    parent: Option<PostId>,
    realm: Option<RealmId>,
    extension: Option<Blob>,
) -> Result<PostId, String> {
    mutate(|state| {
        let extension: Option<Extension> = extension.map(|bytes| parse(&bytes));
        Post::create(
            state,
            body,
            &refs,
            caller(state),
            api::time(),
            parent,
            realm,
            extension,
        )
    })
}

#[update]
fn edit_post(
    id: PostId,
    body: String,
    refs: Vec<FileRef>,
    patch: String,
    realm: Option<RealmId>,
) -> Result<(), String> {
    Post::edit(id, body, refs, patch, realm, read(caller), api::time())
}

#[export_name = "canister_update delete_post"]
fn delete_post() {
    in_executor_context(|| {
        mutate(|state| {
            let (post_id, versions): (PostId, Vec<String>) = parse(&arg_data_raw());
            reply(state.delete_post(caller(state), post_id, versions))
        })
    });
}

#[export_name = "canister_update toggle_bookmark"]
fn toggle_bookmark() {
    mutate(|state| {
        let post_id: PostId = parse(&arg_data_raw());
        reply(match state.principal_to_user_mut(caller(state)) {
            Some(user) => Ok(user.toggle_bookmark(post_id)),
            None => Err("user not found".to_string()),
        });
    });
}

#[export_name = "canister_update toggle_pinned_post"]
fn toggle_pinned_post() {
    mutate(|state| {
        let post_id: PostId = parse(&arg_data_raw());
        if let Some(user) = state.principal_to_user_mut(caller(state)) {
            reply(user.toggle_pinned_post(post_id));
            return;
        };
        reply(Err("User not found".to_string()) as Result<(), String>);
    });
}

#[export_name = "canister_update toggle_following_post"]
fn toggle_following_post() {
    let post_id: PostId = parse(&arg_data_raw());
    let user_id = read(|state| state.principal_to_user(caller(state)).map(|user| user.id));
    reply(match user_id {
        Some(user_id) => {
            mutate(|state| Post::mutate(state, &post_id, |post| Ok(post.toggle_following(user_id))))
        }
        None => Err("user not found".to_string()),
    })
}

#[export_name = "canister_update toggle_hide_post"]
fn toggle_hide_post() {
    let post_id: PostId = parse(&arg_data_raw());
    let user_id = read(|state| state.principal_to_user(caller(state)).map(|user| user.id));
    reply(match user_id {
        Some(user_id) => {
            mutate(|state| Post::mutate(state, &post_id, |post| Ok(post.toggle_hidden(user_id))))
        }
        None => Err("user not found".to_string()),
    })
}

#[export_name = "canister_update toggle_following_user"]
fn toggle_following_user() {
    let followee_id: UserId = parse(&arg_data_raw());
    let registered = read(|state| state.principal_to_user(caller(state)).is_some());
    reply(if registered {
        Ok(mutate(|state| {
            state.toggle_following_user(caller(state), followee_id)
        }))
    } else {
        Err("user not found".to_string())
    })
}

#[export_name = "canister_update toggle_following_feed"]
fn toggle_following_feed() {
    mutate(|state| {
        let tags: Vec<String> = parse(&arg_data_raw());
        reply(
            state
                .principal_to_user_mut(caller(state))
                .ok_or_else(|| "user not found".to_string())
                .and_then(|user| user.toggle_following_feed(&tags)),
        )
    })
}

#[export_name = "canister_update edit_realm"]
fn edit_realm() {
    mutate(|state| {
        let (name, realm): (String, Realm) = parse(&arg_data_raw());
        reply(state.edit_realm(caller(state), name, realm))
    })
}

#[export_name = "canister_update realm_clean_up"]
fn realm_clean_up() {
    mutate(|state| {
        let (post_id, reason): (PostId, String) = parse(&arg_data_raw());
        reply(clean_up_realm(state, caller(state), post_id, reason))
    });
}

#[export_name = "canister_update create_realm"]
fn create_realm() {
    mutate(|state| {
        let (name, realm): (String, Realm) = parse(&arg_data_raw());
        reply(realms::create_realm(state, caller(state), name, realm))
    })
}

#[export_name = "canister_update toggle_realm_membership"]
fn toggle_realm_membership() {
    mutate(|state| {
        let realm_id: RealmId = parse(&arg_data_raw());
        reply(state.toggle_realm_membership(caller(state), realm_id))
    })
}

#[export_name = "canister_update toggle_blacklist"]
fn toggle_blacklist() {
    mutate(|state| {
        let user_id: UserId = parse(&arg_data_raw());
        reply(match state.principal_to_user_mut(caller(state)) {
            Some(user) => {
                user.toggle_blacklist(user_id);
                Ok(())
            }
            None => Err("user not found".to_string()),
        });
    })
}

#[export_name = "canister_update toggle_filter"]
fn toggle_filter() {
    mutate(|state| {
        let (filter, value): (String, String) = parse(&arg_data_raw());
        reply(
            if let Some(user) = state.principal_to_user_mut(caller(state)) {
                user.toggle_filter(filter, value)
            } else {
                Err("user not found".into())
            },
        );
    })
}

#[export_name = "canister_update admin_toggle_ban_user"]
fn admin_toggle_ban_user() {
    let user_id: UserId = parse(&arg_data_raw());
    mutate(|state| reply(state.admin_toggle_ban_user(caller(state), user_id)))
}

#[export_name = "canister_update admin_delete_space"]
fn admin_delete_space() {
    let space_id: RealmId = parse(&arg_data_raw());
    mutate(|state| reply(state.admin_delete_space(caller(state), space_id)))
}

#[export_name = "canister_update admin_set_media_bucket"]
fn admin_set_media_bucket() {
    let bucket_id: String = parse(&arg_data_raw());
    mutate(|state| reply(state.admin_set_media_bucket(caller(state), bucket_id)))
}

#[export_name = "canister_update admin_add_domain"]
fn admin_add_domain() {
    let domain: String = parse(&arg_data_raw());
    mutate(|state| reply(state.admin_add_domain(caller(state), domain)))
}

#[export_name = "canister_update admin_add_admin"]
fn admin_add_admin() {
    let new_admin: String = parse(&arg_data_raw());
    mutate(|state| reply(state.admin_add_admin(caller(state), new_admin)))
}

#[update]
fn set_media_bucket(bucket_id: String) -> Result<(), String> {
    mutate(|state| state.admin_set_media_bucket(canonical_principal(), bucket_id))
}

#[update]
fn add_admin(principal: String) -> Result<(), String> {
    mutate(|state| state.admin_add_admin(canonical_principal(), principal))
}

#[update]
fn backup() {
    mutate(|state| state.create_backup())
}

#[test]
fn check_candid_interface_compatibility() {
    use candid_parser::utils::{service_equal, CandidSource};

    fn source_to_str(source: &CandidSource) -> String {
        match source {
            CandidSource::File(f) => std::fs::read_to_string(f).unwrap_or_else(|_| "".to_string()),
            CandidSource::Text(t) => t.to_string(),
        }
    }

    fn check_service_equal(new_name: &str, new: CandidSource, old_name: &str, old: CandidSource) {
        let new_str = source_to_str(&new);
        let old_str = source_to_str(&old);
        match service_equal(new, old) {
            Ok(_) => {}
            Err(e) => {
                eprintln!(
                    "{} is not compatible with {}!\n\n\
            {}:\n\
            {}\n\n\
            {}:\n\
            {}\n",
                    new_name, old_name, new_name, new_str, old_name, old_str
                );
                panic!("{:?}", e);
            }
        }
    }

    candid::export_service!();
    let new_interface = __export_service();

    let old_interface =
        std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("taggr.did");

    check_service_equal(
        "actual candid interface",
        candid_parser::utils::CandidSource::Text(&new_interface),
        "declared candid interface in taggr.did file",
        candid_parser::utils::CandidSource::File(old_interface.as_path()),
    );
}
