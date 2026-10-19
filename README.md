# EZShare — temporary file sharing with PeerJS

**Frontend:** static HTML, CSS and JavaScript, deployable on GitHub Pages. **Transfers:** browser-to-browser via WebRTC DataChannels. **Signaling:** PeerJS Cloud by default; no separate Cloudflare Worker required. Files are not uploaded to GitHub or the signaling service.

## Quick start

1. Open repository **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**, then **main**, **/(root)** and Save.
3. Visit `https://tbenitz.github.io/ez-share/` after the Pages deployment completes.
4. Select a file, optionally customize its code, password, expiration, and download allowance. Click **Create live share**.
5. Share the generated code/link. Keep the hosting tab active.
6. On a second browser/device, enter the code, click **Find file**, then **Download file**.

There are no environment variables, keys or server installation steps for the default peer-to-peer mode. The PeerJS script loads from jsDelivr CDN and uses the community PeerJS Cloud for session signaling. This **requires an internet connection** and is subject to the availability, usage and rate limits of those third parties.

## What it supports

- Generated or custom (8–32-character) room codes.
- In-browser checksum calculation and SHA-256 verification before a transfer is marked complete.
- Optional access password (PBKDF2-derived verification proof).
- 5-minute to 7-day expiration; 1, 2, 5, 10, 25, 100 or unlimited download allowance.
- File transfers in 48-KiB chunks with data-channel backpressure.
- Download to disk via File System Access API where available; in-memory download fallback otherwise.
- Host takeover by a verified recipient on a best-effort basis when the original owner goes offline.
- PeerServer and TURN server configuration in Settings for advanced deployments.

## Important limitations

This is a **backend-free prototype**, not a security-audited production service. Its limits cannot be made tamperproof without an authoritative server:
- Download counts and expiration live in the browser tab hosting the code. On an unexpected host crash, takeover can lose the latest count. Multiple peers racing to take over a code may result in temporary unavailability; recovery is best-effort.
- A malicious recipient can modify JavaScript, copy or redistribute an already downloaded file, or misrepresent completion. A user cannot rely on one-time download for DRM or deletion of recipients' copies.
- A malicious actor who learns a room code could attempt to impersonate its host or reserve that ID. Password verification does **not** provide end-to-end sender identity authentication. Do not use for confidential files without a separate authenticated, audited design.
- PeerJS Cloud supplies only signaling. WebRTC fails on some firewalls, mobile networks and symmetric NATs unless a working TURN relay is configured. TURN relays encrypted file bytes and may incur transfer costs.
- Background or sleeping tabs can disconnect. Browser storage, memory and disk limits vary. Recipients who select a local disk file and permit reseeding can keep sharing while their tab remains active.
- For best results, use two Chrome-based browsers, and prefer smaller files for in-memory fallback.

## Architecture

- `index.html` — user interface
- `src/app.js` — PeerJS room discovery, transfer, limit tracking, rehosting
- `src/hash.js` — incremental SHA-256
- `src/peer.css` — responsive interface
- `favicon.svg` — site icon

The older `worker/` directory and `src/config.js` are **legacy and not used** by this PeerJS version. They can be removed when no longer needed.

## Testing

A two-device integration test is necessary before relying on transfers. Verify successful transfer and SHA-256 validation, one-download closure, wrong-password rejection, custom code collision, expiration, original-host tab closure with another recipient hosting, and restricted network/TURN handling.

PeerJS: https://peerjs.com/docs/ • GitHub Pages: https://docs.github.com/en/pages
