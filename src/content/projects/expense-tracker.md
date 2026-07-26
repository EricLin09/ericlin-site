---
title: "Expense Tracker"
date: 2026-07-26
description: "An offline Android expense tracker that reads payment notifications into draft records — with a 271-rule on-device lookup table in front of a local LLM, and the measurements that argue for that order."
tech: ["Java", "Android", "SQLite", "llama.cpp", "Qwen3-4B", "JUnit"]
repo: "https://github.com/EricLin09/Android-Expense-Tracker"
status: "completed"
---

A personal expense tracker for Android: native Java, no backend, no analytics, no third-party
SDKs beyond AndroidX and Material Components. I built it for my own use in Australia, so it
handles **CNY and AUD side by side** and reads notifications from the payment apps I actually
use. The UI is in Chinese — that constraint is the whole reason the project exists.

Most trackers make you type every purchase in. This one removes that friction in two places,
and the second is the part worth reading.

## Notification parsing

A `NotificationListenerService` watches Alipay / WeChat Pay / UnionPay notifications and turns
them into draft records. `PaymentParser` extracts the amount and currency with a regex that
deliberately *rejects* numbers preceded by words like 余额 (balance) or 积分 (points) — the
common way a naive parser files your account balance as a purchase.

<figure style="max-width:420px;margin:2rem auto">
  <img src="/projects/expense-tracker/notification-to-record.png" style="width:100%;border-radius:14px;border:1px solid #1e293b"
       alt="A record generated from a payment notification: dining, marked 自动 (automatic), noted as 自动记账 · 支付宝 · 付款成功, minus 26.80 yuan" />
  <figcaption>What one notification produces. The source text was <code>你已成功付款 26.80元，账户余额 3120.55元。商家：星巴克咖啡</code> — the record is ¥26.80, not the ¥3120.55 balance sitting right next to it. Currency came from the 元, and the category from the merchant table, in the callback, offline. Triggered in a debug build through the same <code>ingest</code> path the real listener uses.</figcaption>
</figure>

## The lookup table goes in front of the model, not behind it

Categorisation is two-tier, and the language model is the **fallback, not the default**:

```
payment notification
   │
   ▼
PaymentParser  ──►  amount · currency · direction
   │
   ▼
merchant table (271 rules, on-device)
   │
   ├── hit  ──►  categorised instantly, no network
   │
   └── miss ──►  "uncategorised"
                    │
                    │  user taps "batch classify"  (explicit, never automatic)
                    ▼
                 local LLM on the LAN
                 (llama.cpp + Qwen3-4B-Instruct, Q4)
                    │
                    ├── reachable   ──►  category
                    └── unreachable ──►  stays "uncategorised"
```

The merchant table runs **inside the notification callback**: pure string matching,
microseconds, no network. Only the records it misses are ever offered to a model, and only when
the user explicitly asks. So the common path never touches the network, and a dead server
degrades to *uncategorised* rather than to *wrong data*.

The model runs on a spare Android phone on the same LAN. Financial data never leaves the house
and there is no third-party API in the loop.

<div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;margin:2rem 0">
  <figure style="flex:1 1 260px;max-width:330px;margin:0">
    <img src="/projects/expense-tracker/pending.png" style="width:100%;border-radius:14px;border:1px solid #1e293b"
         alt="Home screen after importing a bank statement: a banner reads 4 records pending classification, and the first row shows 待分类 with the raw description SUSHI HUB BROADWAY" />
    <figcaption style="margin-top:.5rem"><strong>The miss.</strong> Descriptions the table doesn't know stay <em>uncategorised</em> and keep the raw merchant string — nothing guessed, nothing sent anywhere.</figcaption>
  </figure>
  <figure style="flex:1 1 260px;max-width:330px;margin:0">
    <img src="/projects/expense-tracker/classified.png" style="width:100%;border-radius:14px;border:1px solid #1e293b"
         alt="The same home screen after batch classification: the banner is gone and the SUSHI HUB BROADWAY row now reads 餐饮 (dining)" />
    <figcaption style="margin-top:.5rem"><strong>After one tap</strong> of batch-classify. Same row, same framing — the banner is gone and the model has filled the category in.</figcaption>
  </figure>
</div>

A five-row statement import makes the split concrete. One description hit the table
(`CITY OF SYDNEY PARKING METER` → transport) and was categorised offline, in the callback. The
other four went to the model on the explicit tap, and it returned three of them correctly:

<figure style="max-width:420px;margin:2rem auto">
  <img src="/projects/expense-tracker/model-results.png" style="width:100%;border-radius:14px;border:1px solid #1e293b"
       alt="Three classified records: CITY OF SYDNEY PARKING METER as transport, TYPO WORLD SQUARE as dining, PETBARN ALEXANDRIA as shopping" />
  <figcaption>The interesting row is the wrong one. <code>TYPO</code> is a stationery chain, so it belongs under shopping — the model appears to have anchored on “WORLD SQUARE”, a Sydney mall and food court. Exactly the failure mode below: not bad reasoning, just a merchant it was never told about.</figcaption>
</figure>

## Matching rules that survive real bank descriptions

The merchant table looked trivial until it met an actual CommBank statement. Two defects fell
out, both of which had been silently writing wrong data.

**Latin keywords need word boundaries; CJK keywords must not have them.** Plain substring
matching made `UTS` fire on `KRISPY KREME DONUTS` — filing donuts under Education — and `RENT`
fire on `CURRENT ACCOUNT FEE`. Chinese has no word boundaries, so one rule cannot serve both;
the matcher branches on whether the keyword is ASCII.

**Those boundaries then have to bend in exactly three ways**, or real merchants stop matching:

| Case | Example | Handling |
|---|---|---|
| Possessive / plural | `MCDONALD` must hit `MCDONALDS` | accept a single trailing `s` |
| Run-together names | `GUSMAN` must hit `GusmanYGomezWestfiel` | relax the right boundary for keywords ≥ 6 chars |
| Asterisk separators | `UBER EATS` must hit `UBER *EATS` | normalise `*` to a space before matching |

The last one mattered more than it looks: without it, `UBER *EATS` fell through to the shorter
`UBER` rule and every food delivery got filed as **transport**.

Short keywords stay strict — `SHELL` must not match `SHELLEY`, `GYM` must not match `GYMEA`.
Reviewing the false positives showed nearly all of them were caught by the *left* boundary,
which is why relaxing only the right one, and only by length, is safe.

**Every case above is a unit test.** The three concessions compete with each other, and it is
easy to fix one merchant while silently breaking another, so the false positives that motivated
each rule are pinned as assertions rather than described in a comment. 53 tests, plain JVM, no
device needed.

Writing them paid for itself three times before I finished:

- The trailing-`s` concession turned out to be reachable only for keywords shorter than 6
  characters — longer ones hit the length relaxation first. A test written with `MCDONALD` was
  not exercising the rule it claimed to.
- It caught a live bug in `PaymentParser`: 尾号1234 (a card's *last four digits*) was read as
  the amount whenever the real amount had no decimal point. The digits-after-a-hint rule
  demoted card numbers to a *fallback* instead of discarding them, and an integer amount could
  not displace an earlier fallback. Hints are now two sets — "not this transaction's amount,
  but still money" (balance, points) versus "not money at all" (card, order, reference
  numbers).
- The third came from running it rather than from a test. Debug builds carry a
  simulate-a-notification entry — real ones can only be posted by the payment apps
  themselves, so they can't be reproduced on demand — and its first run labelled the source
  "支付" instead of "支付宝". `appName` was using case-sensitive `String.contains("alipay")`
  against a package named `com.eg.android.AlipayGphone`. WeChat and UnionPay have
  all-lowercase package names, so Alipay was the only broken one, and the single existing
  test for this covered WeChat — which is precisely why nothing caught it. All three
  sources are pinned now.

## What the numbers actually are

Measured against a real bank statement — 72 expense rows, not a hand-made fixture:

| | |
|---|---|
| Merchant table coverage, generic rules only | **27.8 %** |
| Model-only accuracy, 30 labelled samples | **83.3 %** |
| Decode speed, Qwen3-4B Q4 on Snapdragon 8 Elite | **~38 tok/s** (≈2 s per record) |

The model's errors were not reasoning failures — they were knowledge gaps. Every miss was a
utility or a local chain (`SYDNEY WATER`, `TELSTRA`, `AGL`, `OFFICEWORKS`), and unknown local
businesses defaulted to "transport". **That is the argument for a lookup table in front of the
model rather than a bigger model behind it:** the failures are things a table knows for free and
a 4B model has simply never been told.

Adding my own frequent merchants pushes coverage well past 80 %, but that number is fitted to
the same statement it was measured on, so I don't quote it as a result.

## Privacy design

- Parsing notifications, extracting amounts, and merchant lookup are **entirely on-device and
  offline**.
- The only network call is the optional LLM fallback, to a host the user types in. No telemetry.
- The built-in table ships **national chains and generic terms only**. Personal merchants go in
  a separate table in the app's private directory, never committed and never shipped — a list of
  specific small businesses is enough to infer where somebody lives and studies.
- Records stay in local SQLite. Backup is CSV export to a folder you pick, via the Storage
  Access Framework.

<div style="display:flex;gap:1rem;flex-wrap:wrap;justify-content:center;margin:2rem 0">
  <figure style="flex:1 1 240px;max-width:300px;margin:0">
    <img src="/projects/expense-tracker/home.png" style="width:100%;border-radius:14px;border:1px solid #1e293b"
         alt="Home screen showing CNY and AUD totals for the month side by side" />
    <figcaption style="margin-top:.5rem">Both currencies tracked side by side, never merged into one number.</figcaption>
  </figure>
  <figure style="flex:1 1 240px;max-width:300px;margin:0">
    <img src="/projects/expense-tracker/stats.png" style="width:100%;border-radius:14px;border:1px solid #1e293b"
         alt="Statistics screen: category donut chart with a note stating the conversion rate used for the percentages and that stored amounts are unchanged" />
    <figcaption style="margin-top:.5rem">The donut states the rate it used for the percentages, and that stored amounts are left untouched.</figcaption>
  </figure>
</div>

## Features

- Manual income/expense entry, editing, recurring transactions
- Dual currency (CNY / AUD), per-currency and combined overview
- Category donut with drill-down; month and year views, each with a six-period expense trend
- Custom categories (icon + colour) on top of seven presets
- CSV import/export with de-duplication; optional daily auto-backup
- 2×2 home screen widget
- Light/dark theme following the system

## Tech

Java · minSdk 26 / target 34 · SQLite (schema v4, migrating) · `NotificationListenerService` ·
Storage Access Framework · `AppWidgetProvider` · custom `View` for the donut chart ·
`HttpURLConnection` for the LLM call (no HTTP library) · JUnit on the parsing and matching logic ·
R8 on release builds (4.3 MB → 1.6 MB)

Two flavours ship from one source tree: `global` is the dual-currency original (271 merchant
rules), `cn` is a China-only build (114 rules) that drops AUD, the exchange-rate call, and the
LLM fallback — for people who would never run a model server. They differ only in a
compile-time constants file and their merchant tables, and install side by side.

Release builds are signed from a `keystore.properties` that isn't committed; without it the
build still succeeds and produces an unsigned APK, so CI and a fresh clone are never blocked.

## Limitations

- Notification parsing only sees apps that post a notification containing an amount. Cash and
  silent transactions are invisible to it.
- The LLM fallback needs a server you run yourself. Without one, records simply stay
  uncategorised.
- Exchange rates come from a public API for display only, and are never applied to stored
  amounts.
