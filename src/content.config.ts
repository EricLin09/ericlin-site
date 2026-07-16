import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    description: z.string(),
    tags: z.array(z.string()),
  }),
});

// 课程内容：文件放在 src/content/courses/<学年>/<课程>/<条目>.md
// semester 用学年制标签："Year 1" ~ "Year 4"、"Master Year 1"、"Master Year 2"
// （排序规则在 pages/courses/index.astro 的 SEMESTER_ORDER 里，加新标签要同步）
// 要挂 PDF 时：把 PDF 放到 public/courses/ 下，frontmatter 里写 pdf: "/courses/xxx.pdf"
const courses = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/courses' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    semester: z.string(),
    course: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    pdf: z.string().optional(),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    date: z.date(),
    description: z.string(),
    tech: z.array(z.string()).default([]),
    repo: z.string().url().optional(),
    demo: z.string().url().optional(),
    // 项目详情页底部渲染的内嵌交互 demo 组件（目前只有 studymate 一种）
    demoWidget: z.enum(['studymate']).optional(),
    status: z.enum(['in-progress', 'completed', 'archived']).default('completed'),
  }),
});

export const collections = { posts, courses, projects };
