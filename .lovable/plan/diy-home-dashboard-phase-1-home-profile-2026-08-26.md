# DIY Home Dashboard — Phase 1: Home Profile

Build the foundation: accounts, a home record with address, a room-by-room profile, and a home value baseline. Projects, tool inventory, and AI estimates come in later phases, but the data model is laid out now so they drop in cleanly.

## What Phase 1 delivers

1. **Landing page** at `/` explaining the product with a sign-in call to action.
2. **Sign up / sign in** with email and password, plus Google sign-in.
3. **Onboarding: your home** — enter the street address. We look up available property basics (square footage, bedrooms, bathrooms, year built, lot size, estimated value) and pre-fill what we can. Anything unavailable stays editable by hand.
4. **Rooms** — add rooms one at a time: name, type (kitchen, bath, bedroom, garage, exterior…), length and width, ceiling height, floor level, and notes. Area and wall area are computed automatically. Rooms are listed as cards with a running total of finished square footage, which we compare against the property record so the user can see when their entries don't add up.
5. **Home overview dashboard** — the home summary at the top (address, key stats, value baseline), the room list below, and placeholder cards for Projects and My Tools marked as coming next, so the shape of the full product is visible.
6. **Edit everything** — address, home details, and each room can be updated or deleted.

## Address lookup — what's realistic

There is no public API that returns a floorplan with room dimensions from an address. What property data providers do return is the property record: square footage, bed/bath counts, year built, lot size, and an automated value estimate. So:

- Address entry is validated and normalized, and property basics are fetched where available.
- Rooms are always entered by the homeowner. The property record acts as a cross-check, not a source of layout.
- The lookup needs a third-party property data account (ATTOM, Rentcast, or similar) with an API key. Until that key is in place, the address form works fully and the property fields are simply entered manually — no blocked flow. I'll walk you through getting a key when you're ready.

## Estimates groundwork

Phase 2 will generate cost, labor hours, value added, and tool needs per project with AI, using the room dimensions and property data as inputs. Nothing in Phase 1 fakes those numbers — the placeholders say "coming next" rather than showing invented values.

## Technical notes

- Backend: Lovable Cloud (Postgres, auth, server functions). Tables: `homes` (one per user, address parts, property basics, value baseline, lookup source), `rooms` (belongs to a home, dimensions, computed area). Row-level security scopes every row to `auth.uid()`, with grants for authenticated users only.
- Auth: protected routes live under an `_authenticated` layout; the landing page and auth page stay public. The header reflects session state and offers sign out.
- Address lookup runs inside a server function so the provider key never reaches the browser; failures degrade to manual entry rather than blocking the form.
- Schema will already include the `projects`, `tools`, and `project_tools` shapes needed for Phase 2 so the later work is additive.
- Visual direction: a practical, workshop-flavored dashboard — dense data cards, strong numerals, restrained color — not a generic SaaS gradient look. I'll define it as design tokens up front.
