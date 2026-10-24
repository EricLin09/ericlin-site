import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

// 只收博客文章。项目页是长期维护的说明页，会改；订阅源要的是按时间发布、发出去就不再变的条目。
export async function GET(context) {
  const posts = (await getCollection('posts')).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  return rss({
    title: 'Retrograde Resonance',
    description: 'Machine learning projects, experiments and coursework notes by Eric Lin.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      // 带尾斜杠，和 sitemap 里的地址保持一致，阅读器去重时不会把同一篇当成两篇
      link: `/blog/${post.id}/`,
      categories: post.data.tags,
    })),
    customData: '<language>en</language>',
  });
}
