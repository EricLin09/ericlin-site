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

The repo includes a reproducible evaluation pipeline: an LLM writes one question per random chunk (that chunk becomes the ground truth), then three retrieval strategies are compared on **Hit@4** (is the ground-truth chunk retrieved) and **MRR@10** (how high it ranks).

| Strategy | Description | Hit@4 | MRR@10 |
|---|---|---:|---:|
| **vector** | Dense retrieval (text-embedding-3-small + Chroma) | **96%** | **0.917** |
| bm25 | Keyword retrieval (BM25) | 92% | 0.844 |
| hybrid | Both retrievers fused with Reciprocal Rank Fusion | 92% | 0.903 |

*Corpus: 12 weeks of data-mining lecture slides, 700 chunks, 24 auto-generated questions.*

**Findings:** dense retrieval alone performed best on this corpus — RRF hybrid did *not* improve on it. Two likely reasons: (1) the auto-generated test questions are LLM paraphrases of the source chunks, which favors semantic matching over exact keyword overlap; (2) equal-weight RRF lets BM25's weaker ranking dilute the vector ranking it disagrees with. With 24 questions one question ≈ 4 percentage points, so the vector-vs-bm25 gap is small — but the 96% Hit@4 ceiling confirms the chunking + embedding pipeline retrieves reliably.

## Roadmap

- [x] Retrieval evaluation: auto-generated test set + vector / BM25 / RRF-hybrid comparison
- [x] Web UI (Streamlit) with streaming output
- [ ] Weighted RRF fusion and a keyword-style question subset, to test whether hybrid retrieval can beat vector-only
- [ ] Measure the impact of different chunk sizes on retrieval quality
- [ ] Mistake book: track low-scoring quiz questions for targeted revision
- [x] Hosted live demo on this site — upload your own materials into a private temporary session (rate-limited, nothing stored)
