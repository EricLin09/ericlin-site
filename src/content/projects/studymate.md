---
title: "StudyMate"
date: 2026-07-16
description: "A RAG agent that turns my lecture notes into a citation-backed Q&A knowledge base and quizzes me on it — with a reproducible retrieval evaluation pipeline."
tech: ["Python", "LangChain", "Chroma", "OpenAI API", "Streamlit"]
repo: "https://github.com/EricLin09/RAG-Chatbot"
demoWidget: "studymate"
status: "in-progress"
---

StudyMate turns a folder of lecture notes (PDF / Markdown / TXT) into a local knowledge base with two modes:

- **Chat** — ask questions in natural language; the agent answers *strictly from the notes*, cites the source file and page for every claim, and says "I don't know" instead of hallucinating when the notes don't cover it.
- **Quiz** — the agent samples random content from the knowledge base, writes short-answer questions, then grades your answers with a score and feedback. A fast way to find gaps before an exam.

## Architecture

```
docs/ (PDF/Markdown/TXT)
   │  ingest.py: incremental indexing (SHA-256 file fingerprints;
   │             modified files get their old chunks replaced)
   ▼
RecursiveCharacterTextSplitter (chunk_size=500, overlap=50)
   ▼
OpenAI text-embedding-3-small ──► Chroma (persisted locally)
   ▼                                   │
chat: retrieve top-4 chunks ──► LLM answers with citations (multi-turn)
quiz: sample random chunks ──► generate question ──► grade answer
                                (separate low-temperature grader model)
```

## Design Decisions

- **chunk_size=500 / overlap=50** — lecture-note paragraphs are short; 500 chars keeps a single concept intact, and the 50-char overlap prevents definitions from being cut at chunk boundaries.
- **Incremental indexing** — files are fingerprinted with SHA-256 content hashes, so only new or modified files get re-embedded (saves API cost); deleted files are removed from the vector store on the next ingest.
- **Mandatory citations** — every answer must end with `[Source: filename p.X]`, which makes answers verifiable against the original notes and discourages hallucination.
- **Separate question-writer and grader** — questions are generated at temperature 0.7 for variety, while grading runs at temperature 0 for stable, reproducible scores.

## Retrieval Evaluation

Hybrid retrieval reaches **0.938 MRR@10** and leads vector-only at 0.917 once BM25 tokenizes by word — the tokenizer switch alone lifts BM25 from 0.844 to 0.904.

| Strategy | Description | Hit@4 | MRR@10 |
|---|---|---:|---:|
| **hybrid** | Both retrievers fused with Reciprocal Rank Fusion | **96%** | **0.938** |
| vector | Dense retrieval (text-embedding-3-small + Chroma) | 96% | 0.917 |
| bm25 | Keyword retrieval (BM25, lower-cased word tokens) | 92% | 0.904 |

*Corpus: 12 weeks of data-mining lecture slides, 700 chunks, 24 auto-generated questions. Hit@4 checks the ground-truth chunk reaches the 4 the app feeds the LLM; MRR@10 measures how high it ranks.*

A paired test set shows how much the phrasing matters. Each of 40 chunks gets two questions sharing one ground truth — a paraphrase and a short keyword lookup — and the phrasing alone moves vector search from 100% Hit@4 to 75%. Hybrid leads on keyword lookups (80% Hit@4, 0.646 MRR) and stays within two points of vector on paraphrases (98% against 100%). Full write-up: [Reword the Question, Lose a Quarter of Your Hits](/blog/rigged-retrieval-benchmark).

## Roadmap

- [x] Retrieval evaluation: auto-generated test set + vector / BM25 / RRF-hybrid comparison
- [x] Web UI (Streamlit) with streaming output
- [x] Keyword-style question subset, paired against paraphrases on the same chunks ([results](/blog/rigged-retrieval-benchmark))
- [x] Hosted live demo on this site — upload your own materials into a private temporary session (rate-limited, nothing stored)
- [ ] Move the app's retriever to hybrid — it leads vector-only on MRR@10 in both test sets
- [ ] Sweep the RRF weight, now that `--bm25-weight` is in place
- [ ] Measure the impact of different chunk sizes on retrieval quality
- [ ] Mistake book: track low-scoring quiz questions for targeted revision
