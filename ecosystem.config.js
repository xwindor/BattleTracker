// pm2 process definition for the session server (docs/APP_DOCUMENTATION.md §8).
//
// Why this file exists (P2-6, durable-rooms review round 5): the deploy
// runbook was `git pull → npx ng build → pm2 restart sr5e`, with no env step
// anywhere, even though `SR5E_TRUST_PROXY=1` is documented as REQUIRED in
// production. Committing the environment here is necessary but **not
// sufficient by itself** (review defect D6, durable-rooms review round 6,
// re-flagged as D-F in round 7 because an earlier version of this comment
// stated the retracted claim below): `pm2 restart <name-or-file>` reuses
// whatever environment pm2 already has stored for the process from the last
// time it was started or explicitly updated — it does **not** re-read the
// `env` block out of this file on an ordinary restart. You must pass
// `--update-env` on **every** restart (`pm2 restart ecosystem.config.js
// --update-env`), or a deploy that changed the block below keeps silently
// serving the previous stored environment. See
// `docs/APP_DOCUMENTATION.md` §"Deploying updates" for the full runbook,
// including the one-time `pm2 delete && pm2 start` migration a droplet
// started before this file existed still needs.
// ~~Restarting against the committed file every time removes that failure
// mode.~~ It does not - that was the retracted claim; do not restate it here.
//
// Values here match the documented single-droplet deployment
// (`docs/APP_DOCUMENTATION.md` §8, Infrastructure table). Override per-host
// with real environment variables if a different droplet needs different
// values — `env` here is the default, not the only source pm2 will honour.
module.exports = {
  apps: [
    {
      name: "sr5e",
      script: "server.js",
      cwd: __dirname,
      // pm2's own restart, not this app's SIGTERM handler's 2s grace timeout -
      // give the graceful shutdown (server.js, `shutdown()`) room to flush
      // pending room writes and close sockets before pm2 sends SIGKILL.
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        // Required behind the documented nginx reverse proxy - see
        // docs/APP_DOCUMENTATION.md §8/§9 and server.js's `creationKey()`.
        // Opt-in on purpose: only set this if a trusted proxy is really
        // appending an X-Forwarded-For entry in front of this process.
        SR5E_TRUST_PROXY: "1",
        SR5E_PROXY_HOPS: "1"
        // SR5E_DATA_DIR: left unset - defaults to <project>/data/rooms, which
        // is gitignored and outside the `git pull` path already. Set this only
        // if the droplet's room data should live somewhere else.
        // ALLOWED_ORIGINS: left unset - defaults to "*". Set to the site's
        // real origin(s) once one is decided (docs/APP_DOCUMENTATION.md §9).
      }
    }
  ]
};
