import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { CookieBanner } from "@/components/cookie-banner";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "APGAR-тест для взрослых" },
      {
        name: "description",
        content:
          "Экспресс-тест вашего стрессового состояния по методике APGAR. 5 параметров, каждый оценивается от 0 до 2. Максимум 10 баллов.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Страница не найдена</p>
        <a href="/" className="mt-4 inline-block text-primary underline">
          На главную
        </a>
      </div>
    </div>
  ),
});

// Анонимный опрос /comm: английский, без входа в Firebase Auth и без баннера cookies.
const isCommSurvey = (pathname: string) => pathname === "/comm" || pathname.startsWith("/comm/");

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (isCommSurvey(pathname)) return <Outlet />;
  return (
    <AuthProvider>
      <Outlet />
      <Toaster />
      <CookieBanner />
    </AuthProvider>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <html lang={isCommSurvey(pathname) ? "en" : "ru"}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
