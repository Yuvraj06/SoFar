import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'SoFar',
    description: 'A spoiler-free AI chat for movies and shows. It only knows what you have watched so far.',
    permissions: ['sidePanel', 'webRequest', 'storage', 'activeTab'], // activeTab lets us screenshot the video tab
    host_permissions: [
      '*://*.hotstar.com/*',
      'https://generativelanguage.googleapis.com/*', // Gemini
      'https://api.groq.com/*', // Groq
      'https://api.themoviedb.org/*', // TMDB
    ],
  },
});
