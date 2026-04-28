# Now Brief

Focused daily view for BMH Solutions. Static PWA shell hosted on GitHub Pages; talks to a Tailscale-only Flask backend on the Mac for live data (weather, calendar, briefings).

**Live:** `https://bmhsolutions3711.github.io/now-brief/`

## How it works

```
phone (PWA)  ──HTTPS──▶  https://bmhsolutions3711.github.io/now-brief/
   │                          (static shell, installable)
   │
   └──fetch w/ Bearer token──▶  https://<mac>:8485/api/snapshot
                                 (Tailscale-only, requires Tailscale connected)
```

- Shell installs as a PWA from a public github.io origin (passes every browser install check)
- Backend stays on `127.0.0.1:8485`, exposed only over Tailscale Serve to the tailnet
- First run: phone prompts for backend URL + auth token (from `~/.config/bmh/.env` `NOW_BRIEF_TOKEN`); both stored in localStorage
- All API calls send `Authorization: Bearer <token>` header
- Phone offline (or off-Tailscale): SW serves cached shell, page shows last-loaded data

## Backend

Lives at `~/Local Models/bik/now-brief/` in the local-only BIK repo (not on GitHub). Requires:

- `OWM_KEY` (OpenWeatherMap)
- `NOW_BRIEF_TOKEN` (32-byte hex secret — generate with `python3 -c "import secrets; print(secrets.token_hex(32))"`)
- Service account JSON at `~/.config/bmh/rca-service-account.json` for Google Calendar
- Calendar shared with `bmh-agent@bmh-solutions.iam.gserviceaccount.com`

Started by `bmh_start.command`.

## Phone install

1. Open Chrome/Brave on the phone, navigate to https://bmhsolutions3711.github.io/now-brief/
2. Browser offers Install / Add to Home screen → confirm
3. Launch from home-screen icon → setup screen prompts for backend URL + token
4. Paste the token (from your Mac's `~/.config/bmh/.env`), tap Connect
5. Connection tested; if good, brief loads. Token cached for future launches.

If browser doesn't offer install, see `feedback_pwa_install_phone.md` (Chrome secure-DNS off, etc.).

## Cache discipline

When shipping shell changes, bump:
- `?v=N` on style.css/app.js link tags in index.html
- `CACHE_NAME=nb-shell-vN` in sw.js
- Versioned URLs in `SHELL` array of sw.js
