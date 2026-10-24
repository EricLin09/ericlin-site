---
title: "Reword the Question, Lose a Quarter of Your Hits"
date: 2026-10-24
description: "Same encoder, same index, the same 40 chunks — only the phrasing changes, and dense retrieval drops from 100% Hit@4 to 75%. A paired test set turns a vague worry about eval design into a measured effect."
tags: ["retrieval", "evaluation", "experiment-design"]
---

Here is the result, before the method:

```
vector search, paraphrase questions:  Hit@4 100%   MRR 0.917
vector search, keyword questions:     Hit@4  75%   MRR 0.565
```

Same encoder. Same index. **The same 40 chunks.** The only variable is how the question is worded.

That is a large effect on a paired design, and it answers a question I left open in July when I [benchmarked three retrieval strategies](/blog/studymate-retrieval-eval) on my lecture notes and found hybrid retrieval no better than plain vector search. I suspected then that my auto-generated questions were doing the work. Now I can put a number on it.

## A paired test set

The original questions were written by an LLM *from* the chunk they were meant to retrieve, in a student's own words. A paraphrase shares meaning with its source but rarely shares rare terms — the case dense retrieval is built for.

So the generator now writes two styles. The paraphrase style is unchanged. The keyword style asks the short lookup question you ask when you already know the name — what an acronym expands to, what a named algorithm means — reusing the passage's own vocabulary instead of restating it. Median question length separates cleanly: **21 words against 6**.

The design is paired. Each of 40 chunks yields one question of each style, sharing a ground truth, so a gap between styles is the phrasing and not the sampling. Two questions per chunk costs one extra API call and removes an entire confound.

| 40 chunks, two phrasings each | vector | bm25 | hybrid |
|---|---:|---:|---:|
| **Paraphrase** — Hit@4 | **100%** | 90% | 98% |
| **Paraphrase** — MRR@10 | **0.917** | 0.846 | 0.883 |
| **Keyword** — Hit@4 | 75% | 75% | **80%** |
| **Keyword** — MRR@10 | 0.565 | 0.638 | **0.646** |

BM25's paired difference against vector changes sign with the question style: **−0.071 MRR on paraphrases, +0.073 on keyword lookups.** The retrievers didn't change. The benchmark did.

## The tokenizer was worth 0.06 MRR on its own

The second finding is cheaper and cleaner. My original BM25 arm split text on whitespace, which makes `entropy,` and `Entropy` distinct terms — on lecture slides, thick with punctuation and capitalised headings, that shreds the vocabulary BM25 runs on.

Lower-cased word tokens, nothing else changed, same 24 original questions:

| Strategy | MRR@10, published | MRR@10, word tokens |
|---|---:|---:|
| vector | 0.917 | 0.917 |
| bm25 | 0.844 | **0.904** |
| hybrid | 0.903 | **0.938** |

Hybrid now leads, with a paired gain over vector of **+0.021 MRR [+0.000, +0.062]**. A preprocessing detail I'd recorded in one line of the method section was worth more than the gap I'd drawn a conclusion from.

## Scope

The sign flips reliably; the magnitudes are not yet pinned down. At 40 questions per style the paired intervals are wide and most include zero — hybrid's keyword advantage is +0.081 MRR [−0.017, +0.177]. The interval that does exclude zero is BM25's deficit on paraphrases, −10 pp Hit@4 [−20, −2].

Three keyword questions were unretrievable by every strategy, and they rhyme: *"What does MSE stand for?"*, *"What is Modularity?"*, *"What is ω?"*. Those are ambiguous by construction — MSE appears in a dozen chunks, so there's no unique right answer, yet the metric scores an equally valid chunk as a miss. Part of what reads as vector's keyword weakness is short questions failing to name a unique target.

One mechanism didn't work. I let the generator return null when a passage named nothing worth looking up; across 40 chunks it never used it, not even on a slide that was a list of citations. A model asked for a question will produce a question, so that has to be a filter I apply rather than a judgement I delegate.

## What it's worth

Three things I'll keep doing:

- **Pair the test set.** The headline number here only exists because the two phrasings share a ground truth. Unpaired, it would have been indistinguishable from having sampled different content.
- **Report the benchmark's own properties.** Median question length told most of this story before any retrieval ran, and it costs nothing to print alongside the scores.
- **Treat preprocessing as a variable.** The tokenizer sat in my method section for three months as a parenthetical. It was the single largest effect I've measured in this project.

The original question — does hybrid beat vector-only on my notes — has a sharper answer now: on keyword lookups it leads on both metrics, on paraphrases it doesn't, and whichever you believe depends entirely on which questions you chose to ask. That's the finding. The retrieval scores were never the interesting part.

*Code and full tables: [the repo](https://github.com/EricLin09/RAG-Chatbot), under `eval/`.*
