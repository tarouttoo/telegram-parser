# Topic taxonomy

Controlled vocabulary for the post index (`knowledge/index/`). Emerged from
clustering the pilot corpus (`grisha`, `wlsbot02` normalized posts); any
change goes through the human curator in an interactive session — agents
propose, the curator decides.

## Rules

- **Multi-tag.** A post may carry several topics; topics are not a partition.
- **Media-only posts** inherit the topics of their album's parent post (the
  post with text in the same media group). Standalone media-only posts are
  not indexed.
- **Out of scope.** Pure lifestyle content (personal life, music, food,
  parties, politics) is not indexed. Trading psychology (burnout, discipline,
  reactions to losses) stays under `risk` and `people-community`.
- Tags are the English slugs below, spelled exactly as listed.

## Topics

### `theory-of-markets`
Market theory as taught in the sources: arbitrage and edge definitions,
theoretical vs arbitrage price, market-maker types (HFT-MM, liquidity
providers, quants), market participant categories, exchange business models.
Grisha's article cycle (parts 1–4 and prefaces).

### `manipulations-algos`
"Algos" and manipulations as practice: the 8 rollout patterns, print-makers
(принтовщики/ерши), leg algos (ножные), mixed algos, cross-instrument
manipulations, liquidation plays (ликвидашки), concrete katka cases, the
scene chronicles (courses, characters, history of the algos niche).

### `microstructure`
Order book mechanics: spread and liquidity, RPI orders, mark price, ADL and
liquidation mechanics, margin borrows, index-price vs real balance,
"laboratory" cases (e.g. MNT anomaly on Bybit).

### `strategies`
Concrete strategies and alpha: spread collection, solo vs hedged MM,
lead-lag, impulse scalps (прострелы), listing sniping, Trigger Limit IOC
orders, prediction-market latency abuse (Polymarket), leverage and capital
efficiency, strategy capacity.

### `toxic-flow`
Toxic flow: what it is, detection, filtering, fair price calculation,
in-book defenses (order placement/replacement against toxic and
arbitrageur flow).

### `latency-engineering`
Speed engineering: tick-to-trade, zero-GC and allocation hygiene, event
loops, callbacks vs async/Task.Run, cores/SIMD/memory layout, DPDK/Aeron,
colocation, private connects and submarine cables, milliseconds-vs-FPS
explain-alls.

### `exchange-api`
Exchange API measurements: MEXC deep research (latency anatomy, artificial
delays, rate limits, error codes, fee regimes, the "fast guy"), stress
tests, third-party trading software integrations (Viking).

### `exchanges`
Exchanges as institutions: tier levels, kitchen/bucket shops (кухни),
MM programs and their conditions, exchange tokens (BNB, MNT), industry
events: hacks, exchanges leaving RF/CIS, delistings, antifraud letters.

### `market-data`
Market data capture and use: recording BBO/L2/trades/liquidations, storage
volumes, price discovery and lead/lag weights, participant reconstruction
from flows.

### `bot-architecture`
Bot architecture and code: modularity, watchdogs, consoles, custom
protocols, Rust vs Python, attitudes to vibecoding and AI tooling, bugs and
their cost.

### `infra`
Servers and operations: the AWS/Vultr/Equinix saga, provider bans and
quotas, telemetry, security (access, ports, watchdog-of-watchdog), monthly
spending.

### `risk`
Risk and blowups: the Oct 2025 liquidation and the year after, the ADL
incident, black swans (Bybit exploit), losses caused by protections,
trading psychology (burnout, tilt, discipline, recovery).

### `pnl-reports`
Recurring trading reports: weekly PnL rundowns, monthly summaries, AUM and
investor flows, investor onboarding stories.

### `people-community`
Community and media: hft_underground, courses and info-gurus, scene
characters, scammers and scam patterns, ethics of market making, career and
lifestyle philosophy of algo traders.

### `tools`
Instruments built by the authors: MarketMicroscope, the zond probe, Grafana
dashboards, screeners, spread/order-book visualization.
