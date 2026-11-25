use super::assets;
use crate::assets::{index_html_headers, INDEX_HTML};
use crate::metadata::set_metadata;
use crate::post::Post;
use crate::read;
use candid::CandidType;
use serde::{Deserialize, Serialize};
use serde_bytes::ByteBuf;

pub type Headers = Vec<(String, String)>;

#[derive(Clone, CandidType, Deserialize)]
pub struct HttpRequest {
    url: String,
    headers: Headers,
}

impl HttpRequest {
    pub fn path(&self) -> &str {
        match self.url.find('?') {
            None => &self.url[..],
            Some(index) => &self.url[..index],
        }
    }
}

#[derive(Debug, Default, CandidType, Serialize)]
pub struct HttpResponse {
    status_code: u16,
    headers: Headers,
    body: ByteBuf,
    upgrade: Option<bool>,
}

#[ic_cdk_macros::update]
fn http_request_update(req: HttpRequest) -> HttpResponse {
    let url = &req.url;
    route(url)
        .map(|(headers, body)| HttpResponse {
            status_code: 200,
            headers,
            body,
            upgrade: None,
        })
        .unwrap_or_else(|| HttpResponse {
            status_code: 400,
            ..Default::default()
        })
}

#[ic_cdk_macros::query]
fn http_request(req: HttpRequest) -> HttpResponse {
    let path = req.path();
    // If the asset is certified, return it; otherwise upgrade to http_request_update for OG routing
    if let Some((headers, body)) = assets::asset_certified(path) {
        HttpResponse {
            status_code: 200,
            headers,
            body,
            upgrade: None,
        }
    } else {
        HttpResponse {
            status_code: 200,
            upgrade: Some(true),
            ..Default::default()
        }
    }
}

fn route(url: &str) -> Option<(Headers, ByteBuf)> {
    read(|state| {
        let filter = |val: &str| {
            val.chars()
                .filter(|c| c.is_alphanumeric() || " .,?!-:/@\n#".chars().any(|v| &v == c))
                .collect::<String>()
        };
        let mut parts = url.split('/');
        let domain = parts.next()?;
        match (parts.next(), parts.next()) {
            (Some("post"), Some(id)) | (Some("thread"), Some(id)) => {
                if let Some(post) = Post::get(state, &id.parse::<u64>().ok()?) {
                    return index(
                        domain,
                        &format!("post/{}", post.id),
                        &format!(
                            "{} #{} by @{}",
                            match post.parent {
                                None => "Post",
                                _ => "Reply",
                            },
                            post.id,
                            state.users.get(&post.user)?.name
                        ),
                        &filter(&post.body),
                        "article",
                    );
                }
                None
            }
            (Some("user"), Some(handle)) => {
                let user = state.user(handle)?;
                index(
                    domain,
                    &format!("user/{}", user.name),
                    &format!("@{}", user.name),
                    &filter(&user.about),
                    "profile",
                )
            }
            (Some("space"), Some(arg)) | (Some("realm"), Some(arg)) => {
                let id = arg.to_uppercase();
                let space = state.realms.get(&id)?;
                index(
                    domain,
                    &format!("space/{}", id),
                    &format!("Space {}", id),
                    &filter(&space.description),
                    "website",
                )
            }
            (Some("tag"), Some(tag)) | (Some("feed"), Some(tag)) => index(
                domain,
                &format!("tag/{}", tag),
                &format!("#{}", tag),
                &format!("Latest posts tagged #{}", tag),
                "website",
            ),
            _ => assets::asset("/"),
        }
    })
}

fn index(
    host: &str,
    path: &str,
    title: &str,
    desc: &str,
    page_type: &str,
) -> Option<(Headers, ByteBuf)> {
    Some((
        index_html_headers(),
        ByteBuf::from(set_metadata(INDEX_HTML, host, path, title, desc, page_type)),
    ))
}
