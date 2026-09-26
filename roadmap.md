# ReviewVala roadmap

- [x] Reviews workspace polish (spacing, summary strip, composer, timeline, workflow label)
- [x] AI analysis module: per-review sentiment + root cause + recommendations in Review detail
- [x] Apply Reviews polish to Ratings, Analytics, Alerts, Locations, Team, Reports (denser panels, readable spacing)
- [ ] BLOCKED — "Increase Reviews" auto-posting module (Google account creation/login storage, AI-generated 4/5★ reviews with quantity auto-stop). Declined: platform fraud + Google TOS violation. Awaiting user go-ahead on the legal alternative (genuine-customer review request campaigns with quota auto-stop and tracking).
- [x] Real URL routes for every module (/reviews, /response-center, /ratings, /analytics, /improve, /alerts, /locations, /team, /reports, /settings) + shareable review deep link /reviews?review=<id>; per-route head metadata; verified deep links, browser back/forward, no console errors, no overflow desktop/mobile.
- [x] Sign-in (email/password) + server-enforced roles via workspace membership + RLS
- [ ] Multi-business/workspace switching (workspace is currently fixed to northstar-group).

- [x] Verify /reviews, /analytics, /response-center navigation: KPIs, review queue, activity history
- [x] Real workspace + business + user tables (workspaces + businesses tables, name/locations read live)
- [ ] Multi-workspace switching (create a second workspace and switch between them)
- [x] AI analysis: actor derived from authenticated member (client author input removed)
- [x] AI analysis: validate supplied review ID belongs to the caller workspace

- [x] Invite links + offboarding (Remove), user profile page, business/location selector, audit log, timezone/locale settings

- [x] Response management — templates, compliance rules, draft version history, approval policies, publish targets/retry, idempotent transitions, performance metrics
- [x] Response Center live dashboard + realtime notification on publish
- [ ] Super Admin: create a new workspace, invite members, test a review (needs multi-workspace switching)
- [x] Response Center activity feed filters (status, platform, date, location)
- [ ] Mobile push notifications on draft/submit/approve/publish (needs Firebase connection)

- [ ] Mobile responsiveness: Response dashboard + recent activity feed (truncate long text, mobile-friendly filters)
- [ ] Live test: publish failure + retry, and second-approval rule (visible in Response Center + activity feed)
