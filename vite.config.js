import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const cfg = JSON.parse(readFileSync(new URL('./app.config.json', import.meta.url), 'utf8'));
const appName = String(cfg.appName || 'Coach').trim();
const helpEmail = String(cfg.helpEmail || '').trim();
const htmlSafe = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Puts the app name and help email from app.config.json into the pages and the web app manifest.
function appIdentity() {
  return {
    name: 'app-identity',
    transformIndexHtml(html, ctx) {
      let out = html;
      if ((ctx.filename || ctx.path || '').endsWith('index.html')) out = out.replace(/<title>.*<\/title>/, `<title>${htmlSafe(appName)}</title>`);
      if (!helpEmail) out = out.replace(/<a href="mailto:\{\{HELP_EMAIL\}\}">\{\{HELP_EMAIL\}\}<\/a>/g, 'your coach');
      const updated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      return out.replaceAll('{{APP_NAME}}', htmlSafe(appName)).replaceAll('{{HELP_EMAIL}}', htmlSafe(helpEmail)).replaceAll('{{UPDATED}}', updated);
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify({
          name: appName,
          short_name: appName.length > 12 ? appName.split(/\s+/)[0] : appName,
          start_url: '/',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#F2F0EB',
          theme_color: '#10161C',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
        }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [appIdentity()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        privacy: fileURLToPath(new URL('./privacy.html', import.meta.url)),
      },
    },
  },
  server: {
    host: true,
  },
});
