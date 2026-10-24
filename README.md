# Retrograde Resonance

The personal site of Eric (Xi) Lin — machine-learning research, projects and the write-ups behind them, live at **[ericlin09.vercel.app](https://ericlin09.vercel.app)**.

The home page paints on **63 KB**. A hand-written Three.js solar system — custom sun shader, real axial tilts, bloom — loads behind it once the browser is idle, and its twelve planet textures ship as WebP at **479 KB**, down from 5.2 MB.

## What's on it

- **Research** — contrastive fine-tuning for retrieval: [pair selection with volume-matched controls](https://ericlin09.vercel.app/projects/pseudo-positive-selection) and [hard versus random negatives on FiQA](https://ericlin09.vercel.app/projects/hard-negatives).
- **Projects** — [StudyMate](https://ericlin09.vercel.app/projects/studymate), a RAG study agent with a live demo; a credit-risk classification pipeline; an offline Android expense tracker.
- **Blog** — what each experiment measured, written up with the numbers.

## Built with

Astro 5 · Tailwind CSS 4 · Three.js · PDF.js · Vercel

## How the pages stay fast and readable

- **First paint carries no 3D.** The scene lives in `src/components/solar-system.ts` and is dynamically imported on `requestIdleCallback`. Its own imports stay static so they tree-shake: the deferred chunk is 540 KB, where importing `three` dynamically produced 717 KB. The render loop stops once the backdrop scrolls out of view or the tab is hidden.
- **Figures match the page.** Research figures are re-rendered on the site's slate-950 background from their original evidence JSON. Figures without an available source carry a `-light` suffix and render through an invert + hue-rotate filter, which flips lightness while keeping their colour encoding.
- **Numbers read as data.** Markdown marks numeric columns right-aligned, and the stylesheet sets them in tabular monospace so decimals line up. Below 768px, wide tables scroll inside their own box and the page stays at device width.
- **Secondary text clears WCAG AA.** `slate-450` (`#6d7d94`) reaches 4.81:1 on the page and 4.51:1 on the brightest hover state. Keyboard focus shows an indigo ring, and a skip link leads straight to the content.
- **One social card for every page** — `public/og-default.png`, 1200×630, served through absolute `og:image` and `twitter:image` URLs.

## Run it

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # static site into dist/
```

Build with the dev server stopped. A production build against a live dev server leaves Vite's dependency cache stale, and the dynamically imported solar system and PDF viewer then fail to load in dev; clearing `node_modules/.vite` and restarting brings them back.

## Content

| Collection | Path | Deployed |
|---|---|---|
| Blog posts | `src/content/posts/` | yes |
| Projects | `src/content/projects/` | yes |
| Course notes | `src/content/courses/` and `public/courses/` | local only |

Course notes stay on the local machine: both paths are gitignored, so the deployed site ships without third-party lecture material, and the Courses link appears only when the collection has entries. The StudyMate demo reads its API base from `PUBLIC_STUDYMATE_API`; without it the widget doesn't render.
