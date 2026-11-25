# Relay

An open, ad-free social network hosted on the [Internet Computer](https://internetcomputer.org), featuring:

-   **Zero crypto friction:** Free signup and posting via **Internet Identity** passkeys.
-   **Modern 3-column React 19 + Tailwind CSS frontend:** Dark-first design with Light mode toggle, responsive mobile bottom navigation, and centralised branding in [`src/frontend/src/brand.ts`](./src/frontend/src/brand.ts) and [`src/backend/env/config.rs`](./src/backend/env/config.rs).
-   **Rich social features:** Markdown posts, threaded replies, **Spaces** (topic communities, up to 3 per account), toggleable emoji reactions, polls, reposts, bookmarks, hashtag feeds, search, notifications, and profiles.
-   **Shared app-managed media storage:** A single shared `bucket` canister funded by you, with automatic client-side WebP compression, server-side MIME/size checks (512 KB/image), and per-user quotas (50 MB/user).
-   **Single-admin moderation:** The deployer principal is automatically granted admin privileges (delete posts, suspend/restore accounts, delete Spaces, configure the shared media bucket, and register custom domains).

---

## Customising Your Brand

Change your app name, tagline, community label, or accent colour in two places:

1. Frontend: [`src/frontend/src/brand.ts`](./src/frontend/src/brand.ts) (name, tagline, accent preset, emoji reactions) + icons in [`src/frontend/assets/`](./src/frontend/assets/).
2. Backend: `CONFIG.name` in [`src/backend/env/config.rs`](./src/backend/env/config.rs).

---

## Local Development

Install prerequisites:

```bash
npm install -g @icp-sdk/icp-cli @icp-sdk/ic-wasm
npm install
```

Build and deploy both canisters locally:

```bash
make start
NODE_ENV=production DFX_NETWORK=local npm run build
icp deploy relay
icp deploy bucket
```

Link the shared media bucket (run once after creating canisters):

```bash
APP_ID=$(icp canister id relay)
BUCKET_ID=$(icp canister id bucket)

# Authorise the main app canister to write into the shared bucket
icp canister call bucket add_controller "(principal \"$APP_ID\")"

# Point the main app canister at the shared bucket
icp canister call relay set_media_bucket "(\"$BUCKET_ID\")"
```

---

## Deploying to Internet Computer Mainnet

1. **Create or select your mainnet identity** (make sure it holds ICP / cycles):

    ```bash
    icp identity new mainnet
    icp identity default mainnet
    icp cycles balance -e ic
    ```

2. **Build the production frontend bundle** (embedded into the Rust canister Wasm):

    ```bash
    NODE_ENV=production DFX_NETWORK=ic npm run build
    ```

3. **Deploy the app canister and shared media bucket to IC mainnet:**

    ```bash
    icp deploy -e ic relay
    icp deploy -e ic bucket
    ```

    Keep your personal identity as the controller of both canisters so you can always push upgrades with `icp deploy -e ic relay`.

4. **Link the shared media bucket** so users can upload photos with zero crypto setup:

    ```bash
    APP_ID=$(icp canister id -e ic relay)
    BUCKET_ID=$(icp canister id -e ic bucket)

    icp canister call -e ic bucket add_controller "(principal \"$APP_ID\")"
    icp canister call -e ic relay set_media_bucket "(\"$BUCKET_ID\")"
    ```

5. **Open your live app:**

    ```
    https://<APP_ID>.icp0.io
    ```

    Sign in with Internet Identity, then grant your Internet Identity principal admin access so you can moderate directly from the web UI (**Settings & Admin**):

    ```bash
    icp canister call -e ic relay add_admin "(\"<YOUR_II_PRINCIPAL>\")"
    ```

6. **Optional — Attach a Custom Domain Later:**
    - Add your domain in **Settings & Admin → Register custom domain** (this updates `/.well-known/ic-domains` automatically).
    - Add the standard IC DNS records (`CNAME` to `<APP_ID>.icp0.io`, `_canister-id` `TXT` record) and register the domain with the IC boundary nodes.

---

## Checks & Builds

```bash
make format   # cargo fmt + prettier
make check    # cargo check --tests, cargo fmt --check, tsc --noEmit, prettier --check
npm run test:unit
```
