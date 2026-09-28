// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

// firebase-admin нельзя упаковывать в серверный бандл: google-gax внутри него ищет свои файлы
// через __dirname, которого нет в ESM, и функция на Vercel падает с 500. Штатный traceDeps
// Nitro здесь не срабатывает (не находит подпути firebase-admin/* по exports, а при обходе
// ломается rollup), поэтому пакет помечается внешним, а его файлы со всеми зависимостями
// копируются в node_modules функции отдельной трассировкой после сборки.
const SERVER_EXTERNAL_ENTRIES = [
  "firebase-admin/app",
  "firebase-admin/auth",
  "firebase-admin/firestore",
];

export default defineConfig({
  cloudflare: false,
  vite: {
    plugins: [
      nitro({
        preset: "vercel",
        rollupConfig: { external: [/^firebase-admin(?:\/|$)/] },
        // Модуль, а не hooks.compiled в конфиге: хук в конфиге заменил бы хук пресета vercel,
        // который пишет .vercel/output/config.json, и Vercel не нашёл бы результат сборки.
        modules: [
          {
            name: "trace-firebase-admin",
            setup(nitro) {
              nitro.hooks.hook("compiled", async () => {
                if (nitro.options.dev) return;
                // nf3 — трассировщик, которым пользуется сам Nitro (внутри @vercel/nft).
                const { traceNodeModules } = await import("nf3");
                await traceNodeModules(
                  SERVER_EXTERNAL_ENTRIES.map((id) => fileURLToPath(import.meta.resolve(id))),
                  {
                    rootDir: nitro.options.rootDir,
                    outDir: nitro.options.output.serverDir,
                    conditions: ["node", "import", "default"],
                  },
                );
              });
            },
          },
        ],
      }),
    ],
  },
});
