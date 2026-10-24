# NOESIS — existing Cloudflare offline support blocked by lifecycle guard

The dedicated-origin build already emits a scoped service worker and tests its cache
policy, but the application lifecycle registered it only on github.io. A clean Cloudflare
visit therefore never installed it. The added source-wired lifecycle regression fails
on main for the dedicated production and isolated test HTTPS origins.

The minimal correction removes the obsolete hostname restriction. HTTPS remains required;
registration stays relative (`sw.js`, default scope), with existing update and error paths.
No cache, storage, origin transport, OAuth setting or UI is changed. Existing SW ownership
and data-origin tests remain required. The source regression passes locally after correction.
Browser CI must run on the exact head; deployed Cloudflare and physical iPhone offline
behavior remain unverified because this mission authorizes no deployment or personal data.

Rollback after an explicitly approved deployment: revert only this lifecycle change by PR.
Do not unregister existing workers or clear caches/data. A code revert is not data recovery.
