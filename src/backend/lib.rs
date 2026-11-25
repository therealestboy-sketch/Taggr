#![allow(dead_code)]

use candid::Principal;
use env::{config::CONFIG, user::User, State, *};
use ic_cdk::{api::msg_reply, export_candid};
use std::{cell::RefCell, collections::HashMap};

mod assets;
#[cfg(feature = "dev")]
mod dev_helpers;
mod env;
mod http;
mod metadata;
mod queries;
mod updates;

const BACKUP_PAGE_SIZE: u32 = 1024 * 1024;

thread_local! {
    static STATE: RefCell<State> = Default::default();
    #[cfg(test)]
    pub static TEST_TIME: RefCell<Time> = Default::default();
}

pub fn read<F, R>(f: F) -> R
where
    F: FnOnce(&State) -> R,
{
    STATE.with(|cell| f(&cell.borrow()))
}

pub fn mutate<F, R>(f: F) -> R
where
    F: FnOnce(&mut State) -> R,
{
    STATE.with(|cell| f(&mut cell.borrow_mut()))
}

fn parse<'a, T: serde::Deserialize<'a>>(bytes: &'a [u8]) -> T {
    serde_json::from_slice(bytes).expect("couldn't parse the input")
}

fn reply<T: serde::Serialize>(data: T) {
    msg_reply(serde_json::json!(data).to_string().as_bytes());
}

fn stable_to_heap_core() {
    STATE.with(|cell| cell.replace(env::memory::stable_to_heap()));
    mutate(|state| state.init());
}

fn optional(s: String) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

pub fn performance_counter(_n: u32) -> u64 {
    #[cfg(test)]
    return 0;
    #[cfg(not(test))]
    ic_cdk::api::performance_counter(_n)
}

pub fn id() -> Principal {
    #[cfg(test)]
    return Principal::from_text("aaaaa-aa").expect("parsing failed");
    #[cfg(not(test))]
    ic_cdk::api::canister_self()
}

pub fn time() -> u64 {
    #[cfg(test)]
    return TEST_TIME.with(|cell| *cell.borrow());
    #[cfg(not(test))]
    ic_cdk::api::time()
}

#[allow(unused_imports)]
use crate::env::{
    post::{FileRef, PostId},
    user::UserId,
};
use crate::http::{HttpRequest, HttpResponse};
#[allow(unused_imports)]
use crate::realms::RealmId;
#[allow(unused_imports)]
use serde_bytes::ByteBuf;
export_candid!();

#[cfg(test)]
mod social_tests {
    use super::*;
    use crate::env::{post::Post, realms::Realm};

    fn test_principal(id: u8) -> Principal {
        Principal::from_slice(&[id, 1, 2, 3])
    }

    #[test]
    fn free_social_rules_spaces_cap_reactions_and_admin() {
        let admin = test_principal(1);
        let alice = test_principal(2);
        let bob = test_principal(3);

        let mut state = State::default();
        state.admins.insert(admin);
        state.init();

        // Fresh init seeds both localhost and canister icp0.io domain, without DAO/STALWARTS realms.
        assert!(state.domains.contains_key("localhost"));
        assert!(state.domains.contains_key("aaaaa-aa.icp0.io"));
        assert!(state.realms.is_empty());

        // Free user creation with zero credits.
        let alice_id = state.new_user(alice, 1_000, "alice".into(), None).unwrap();
        let bob_id = state.new_user(bob, 1_000, "bob".into(), None).unwrap();

        // User can create up to 3 Spaces for free; 4th is rejected.
        for name in ["DESIGN", "TECH", "PHOTOS"] {
            realms::create_realm(&mut state, alice, name.into(), Realm::default()).unwrap();
        }
        let fourth = realms::create_realm(&mut state, alice, "EXTRA".into(), Realm::default());
        assert!(fourth.is_err());

        // Free post in a Space, free toggleable emoji reactions.
        let post_id = Post::create(
            &mut state,
            "Hello #relay world!".into(),
            &[],
            alice,
            2_000,
            None,
            Some("DESIGN".into()),
            None,
        )
        .unwrap();

        state.react(bob, post_id, 12, 3_000).unwrap();
        assert!(Post::get(&state, &post_id).unwrap().reactions[&12].contains(&bob_id));
        // Clicking the same emoji again toggles it off.
        state.react(bob, post_id, 12, 4_000).unwrap();
        assert!(!Post::get(&state, &post_id)
            .unwrap()
            .reactions
            .contains_key(&12));

        // Admin can suspend a user (hiding their posts from feeds) and delete any post/Space.
        assert_eq!(state.admin_toggle_ban_user(admin, alice_id).unwrap(), true);
        assert_eq!(
            state
                .last_posts("aaaaa-aa.icp0.io".into(), None, 0, 0, false)
                .count(),
            0
        );
        state.delete_post(admin, post_id, vec![]).unwrap();
        assert!(Post::get(&state, &post_id).unwrap().is_deleted());
        state.admin_delete_space(admin, "DESIGN".into()).unwrap();
        assert!(!state.realms.contains_key("DESIGN"));
        assert_ne!(alice_id, bob_id);
    }
}
