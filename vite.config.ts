import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

// firebase-admin нельзя упаковывать в серверный бандл: google-gax внутри него ищет свои файлы
// через __dirname, которого нет в ESM, и функция на Vercel падает с 500. Штатный traceDeps
// Nitro здесь не срабатывает (не находит подпути firebase-admin/* по exports, а при обходе
// ломается rollup), поэтому пакет помечается внешним, а его файлы со всеми зависимостями
// копируются в node_modules функции отдельной трассировкой после сборки.
const SERVER_EXTERNAL_ENTRIES = ["firebase-admin/app", "firebase-admin/firestore"];

export default defineConfig({
  server: { host: "::", port: 8080 },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Файлы из src/server/ нельзя импортировать в клиентский код: сборка падает.
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    viteReact(),
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
});
