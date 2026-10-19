# EZShare — temporary browser file sharing

This is the repository for EZShare.

## Source and deployment

The complete project is provided in the **ezshare-repository.zip** attachment in the ChatGPT conversation where this repository was created. Unzip it and upload the extracted files preserving the directory structure.

GitHub Pages alone cannot support discovery of live sessions or WebRTC signaling. This project has two parts:

1. Static frontend: index.html, favicon.svg and src/*
2. Cloudflare Worker: worker/*, including SQLite Durable Object for temporary session coordination.

The Worker must be deployed independently with `cd worker && npm install && npx wrangler deploy`. Set `ALLOWED_ORIGINS` to your GitHub Pages origin and `SIGNALING_URL` in `src/config.js` to your new Worker HTTPS endpoint.

GitHub Pages: Settings > Pages > Build and deployment > Deploy from a branch > main > / (root).

**Never add passwords, TURN tokens or other secrets to public GitHub files.** Keep TURN_API_TOKEN as a Wrangler secret if configured.

### Privacy and limitations

Files are transferred by encrypted browser WebRTC data channels, not stored on GitHub or in the Cloudflare Worker. Complete recipients can continue hosting if allowed. The tab and device must remain active; some mobile browsers suspend background tabs. Download limits restrict the app's authorized transfers and cannot prevent a recipient from separately copying or redistributing an already downloaded file. TURN relay might be required on restrictive networks.

This repository was initialized via the GitHub connector; the frontend and Worker source have not all been transferred into this repository yet.
