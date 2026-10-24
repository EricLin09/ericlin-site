---
title: "When Hybrid Retrieval Loses to Plain Vector Search"
date: 2026-07-16
description: "I benchmarked vector, BM25, and RRF-hybrid retrieval on my own lecture notes. The industry-default 'hybrid is better' didn't hold — and the reasons say a lot about how eval sets get built."
tags: ["RAG", "retrieval", "evaluation"]
---

> **Followed up, October 2026.** I built the keyword question subset this post asks for, and paired it against the paraphrases on the same chunks. Rewording the question alone moves vector search from 100% to 75% Hit@4, and flips the sign of BM25's advantage — so the comparison below holds for *this* question style, not in general. The numbers are in [Reword the Question, Lose a Quarter of Your Hits](/blog/rigged-retrieval-benchmark).

While building [StudyMate](/projects/studymate) — a RAG agent over my lecture notes — I wanted an answer to a question that's easy to skip: **does the retrieval actually work, or does it just look like it works?** If the right chunk isn't in the context window, everything downstream (citations, "I don't know" honesty, quiz grading) is built on sand.

So before trusting it for exam revision, I built a small evaluation pipeline.

## Setup

**Test set.** An LLM writes one question per randomly-sampled chunk; that chunk becomes the ground-truth answer location. 24 questions over a corpus of 700 chunks (12 weeks of data-mining lecture slides, `chunk_size=500`, `overlap=50`). Cheap to generate, and — as we'll see — systematically biased in an interesting way.

**Strategies.**

- **vector** — dense retrieval, `text-embedding-3-small` + Chroma
- **bm25** — classic keyword retrieval (whitespace tokenization)
- **hybrid** — both, fused with equal-weight Reciprocal Rank Fusion (RRF)

**Metrics.** **Hit@4** (is the ground-truth chunk among the top 4 — because the app feeds 4 chunks to the LLM) and **MRR@10** (how high does it rank).

## Results

| Strategy | Hit@4 | MRR@10 |
|---|---:|---:|
| **vector** | **96%** | **0.917** |
| bm25 | 92% | 0.844 |
| hybrid | 92% | 0.903 |

The industry lore says hybrid should win — dense retrieval catches paraphrases, BM25 catches exact terms, fusion gets both. On my corpus, **hybrid didn't just fail to beat vector; it lost to it.**

## Why, probably

**1. My test set is biased toward semantic matching.** The questions are LLM *paraphrases* of the source chunks. A paraphrase rarely shares exact keywords with its source — which is precisely the case dense retrieval dominates and BM25 struggles with. A human-written test set would include questions like "what does ID3 stand for?", where BM25's exact-term matching shines. My generator produced almost none of those. **The way you build an eval set quietly decides which retriever wins.**

**2. Equal-weight RRF dilutes a strong ranker with a weak one.** RRF trusts both rankers equally. When vector ranks the true chunk #1 and BM25 ranks it #15, fusion drags it down — enough to lose a hit that vector alone had. Fusion helps when the two rankers fail on *different* queries; here BM25 mostly failed on a subset of what vector got right, so fusion had nothing to add and something to subtract.

**A caveat that matters:** with 24 questions, one question ≈ 4 percentage points. The vector-vs-bm25 gap is within noise; the honest headline is "no evidence hybrid helps here", not "hybrid is worse". The 96% ceiling is the robust finding — the chunking + embedding pipeline retrieves reliably.

## What I'd do next

- **Weighted fusion** (favor vector, use BM25 as a tiebreaker) instead of equal-weight RRF.
- **A keyword-style question subset** — acronyms, named algorithms, formula names — to give BM25 a fair fight and measure where it actually earns its keep.
- More questions, obviously.

*Both of the first two are [done, with results](/blog/rigged-retrieval-benchmark) — along with a third thing I hadn't thought to list: the whitespace tokenizer above was costing BM25 0.06 MRR by itself.*

## Takeaway

Don't inherit retrieval defaults from blog posts — including this one. The whole experiment runs in minutes and costs cents (`eval/` in the [repo](https://github.com/EricLin09/RAG-Chatbot)); benchmarking on *your* corpus with *your* query distribution is cheaper than debugging a RAG system that retrieves the wrong things politely.
