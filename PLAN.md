# murmuration — plan

> A murmuration is a starling flock's emergent sky-art, and the murmur of a crowd.
> This site is both: generative art where the p2p swarm **is** the picture.

## The pitch

Every visitor gets a unique flock, grown deterministically from a seed. Alone,
your flock swirls through flow fields — a living artwork that is yours and
reproducible from a short seed string. But when other people are on the site at
the same time, their flocks glide in from the edge of your screen and merge
with yours. Presence isn't a green dot in a corner; it's *their birds in your
sky*. When they leave, a few of their birds may stay with you — and you carry
them to the next person you meet. The site has no server and no database: its
memory is the swarm itself.

## Hard constraints

- **GitHub Pages only.** Static files, HTTPS. No server, no websocket backend,
  no database.
- Therefore: all computation client-side; p2p via WebRTC with signaling
  piggybacked on public infrastructure; persistence via localStorage + gossip.

## Architecture

### 1. Identity & genome (deterministic art)
- A visitor's **seed** is a random string minted on first visit (stored in
  localStorage; also settable via `?seed=` for sharing/reproduction).
- Seed → seeded PRNG (xoshiro/splitmix over the string hash) → **genome**:
  - palette (2–3 hues, drawn from a curated gamut so any two flocks look good together)
  - bird count, size distribution, wing shape params
  - behavior: cohesion / separation / alignment weights, max speed, turn rate,
    "personality" (skittish ↔ serene)
  - flow-field affinity (how strongly they ride the invisible currents)
- Same seed ⇒ same flock, forever, on any machine. Seeds are the shareable artifact.

### 2. Simulation & rendering
- Boids with spatial-hash neighbor lookup; target 2–5k birds at 60fps.
- A slowly-evolving simplex-noise **flow field** gives the sky structure
  (this is what makes it *art* rather than a demo).
- Renderer: **Canvas 2D first** (fast enough at this scale, trivial to ship),
  with painterly options (motion trails via low-alpha clears). Port the hot
  path to WebGL instancing only if profiling demands it.
- Pointer interaction: your cursor is a falcon — birds scatter around it.
  Cheap, delightful, and it teleses "these are alive."

### 3. P2P layer (phase 2)
- **Trystero** for WebRTC with serverless signaling (BitTorrent trackers /
  Nostr relays — no infrastructure we own). Fallback strategy list baked in.
- Everyone joins a site-wide room (shard by first byte of seed if crowded).
- What syncs (small + infrequent — the sim itself never syncs):
  - `hello`: your genome + roster of adopted flocks you carry
  - `migrate`: occasional bird-handoff events (N of my birds join your sim)
  - `gossip`: genomes of departed visitors, with hop-count + last-seen
- Each client simulates all flocks locally; only genomes and events cross the
  wire. No CRDT needed at this stage — genomes are immutable values, so
  set-union gossip is conflict-free by construction.

### 4. Memory without a server (phase 3)
- localStorage: your seed, your genome, your **roost** (adopted flock genomes
  with lineage: who you got them from, how many hops from their creator).
- On peer connect: exchange roosts, union, cap by an eviction policy
  (prefer low-hop, recently-seen, and "favorited" flocks).
- Consequence we embrace: if no visitors overlap for long enough, the world
  forgets. The site is a campfire; it stays lit only while people tend it.

### 5. Deploy
- Vite + vanilla TypeScript, no framework (it's a canvas app; keep the DOM
  surface tiny).
- GitHub Actions workflow: build → deploy to Pages on push to `main`.
- `?seed=` URLs are the share mechanism; OG-image nicety later.

## Roadmap

| Phase | Deliverable | Definition of done |
|-------|-------------|--------------------|
| 0 | Scaffold | Vite + TS + Pages workflow deploys a hello-canvas |
| 1 | **Solo flock** | Seed → unique beautiful flock; flow field; falcon cursor; `?seed=` sharing |
| 2 | **Presence** | Two browsers on the site see each other's flocks merge live |
| 3 | **Gossip memory** | Roost panel, adopted flocks persist & spread, lineage shown |
| 4 | Polish | Trails/painterly mode toggle, PNG export, about page, sound (maybe) |

Phase 1 must be good *alone* — most visits will be solo, and the p2p magic
only lands if the baseline art is worth staring at.

## Open questions (user to confirm)

1. **Concept veto?** Murmuration + gossip persistence were chosen while you
   were AFK (they were my recommendations). Breeding gallery / infinite
   garden / shader canvas are logged as options in the decision graph if you'd
   rather pivot — nothing is built yet.
2. **Visual direction:** painterly (trails, soft alpha, ink-wash) vs. crisp
   (sharp marks, flat color)? Leaning painterly.
3. **Room scope:** one global room for the whole site, or rooms per URL path
   so people can make private skies (`/sky/our-thing`)? Leaning global first.
4. **Sound:** generative murmur/wind audio is very on-theme but easy to get
   wrong. Phase 4 decision.

## Risks

- **Public signaling infra flakiness** — mitigate with multiple Trystero
  strategies and graceful solo degradation (site must be lovely with 0 peers).
- **Perf on low-end devices** — adaptive bird count from a startup benchmark.
- **Griefing** (hostile genomes) — genomes are numeric params clamped to safe
  ranges at ingest; nothing executable ever crosses the wire.
