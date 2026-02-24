# Security Notes

This project is a static Angular web app. When deployed, only the compiled files in `dist/` should be publicly served.

## Current status

- `npm audit --omit=dev` reports `0` production vulnerabilities.
- Remaining `npm audit` findings are in build/lint/deploy toolchain dependencies (dev-only).

## Deployment hardening checklist

1. Serve only static files from `dist/`.
2. Use HTTPS only and redirect HTTP to HTTPS.
3. Add HTTP response headers at your host/CDN:
   - `Content-Security-Policy`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy` (deny unused features)
   - `Strict-Transport-Security` (when HTTPS is fully enforced)
4. Disable directory listing on the web server.
5. Do not expose source maps in production unless you need them.
6. Keep CI/CD secrets out of the frontend and out of git.
7. Re-run:
   - `npm audit --omit=dev`
   - `npm run build`
   before each release.

## Notes about dev dependency advisories

`npm audit` without `--omit=dev` still reports advisories in dev tooling. These do not ship to browsers, but they can affect CI/build environments. Keep build runners updated and prefer isolated CI environments.
