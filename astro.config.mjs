// @ts-check
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import * as pagefind from 'pagefind';

import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// 站内搜索。索引在构建结束后从生成的 HTML 里建，写到 dist/pagefind；
// 只收带 data-pagefind-body 的页面（文章、项目、About），列表页和课程页不进索引。
// 写成集成而不是 postbuild 脚本：Vercel 不管跑 astro build 还是 npm run build 都会建索引。
/** @returns {import('astro').AstroIntegration} */
function pagefindSearch() {
  let bundleDir = '';
  return {
    name: 'pagefind-search',
    hooks: {
      'astro:config:done': ({ config }) => {
        bundleDir = join(fileURLToPath(config.outDir), 'pagefind');
      },
      // 开发服务器没有构建产物，借用上一次构建的索引，本地也能直接试搜索（结果以那次构建为准）
      'astro:server:setup': ({ server }) => {
        const types = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
        server.middlewares.use('/pagefind', (req, res, next) => {
          // normalize 吃掉 ../，请求出不了 dist/pagefind；畸形编码或文件不存在都交给后面的 404
          let file;
          try {
            file = join(bundleDir, normalize(decodeURIComponent((req.url ?? '/').split('?')[0])));
            if (!statSync(file).isFile()) return next();
          } catch {
            return next();
          }
          res.setHeader('Content-Type', types[/** @type {'.js'} */ (extname(file))] ?? 'application/octet-stream');
          createReadStream(file).pipe(res);
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        const { index, errors } = await pagefind.createIndex({});
        // 出错也要关掉 pagefind 的子进程，否则构建报错后 node 进程挂着不退出
        try {
          if (!index) throw new Error(`Pagefind: ${errors.join('; ')}`);
          const added = await index.addDirectory({ path: fileURLToPath(dir) });
          const written = await index.writeFiles({ outputPath: bundleDir });
          const problems = [...added.errors, ...written.errors];
          if (problems.length) throw new Error(`Pagefind: ${problems.join('; ')}`);
          const entry = JSON.parse(readFileSync(join(bundleDir, 'pagefind-entry.json'), 'utf8'));
          const indexed = Object.values(entry.languages).reduce((n, lang) => n + lang.page_count, 0);
          logger.info(`indexed ${indexed} of ${added.page_count} pages`);
        } finally {
          await pagefind.close();
        }
      },
    },
  };
}

// https://astro.build/config
export default defineConfig({
  site: 'https://ericlin09.vercel.app',
  integrations: [sitemap(), pagefindSearch()],
  devToolbar: {
    enabled: false,
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
