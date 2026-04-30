"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Workspace" },
  { href: "/upload", label: "Upload Literature" },
  { href: "/chat", label: "Ask Your Papers" },
] as const;

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-[var(--background)]/90 shadow-[0_10px_30px_-24px_rgba(15,23,42,0.65),0_1px_0_0_rgba(148,163,184,0.18)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-sm">
            <svg
              viewBox="0 0 24 24"
              className="h-4.5 w-4.5 text-[var(--accent)]"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden
            >
              <path d="M4 6.5c2.4-1.6 4.8-2.4 8-2.4s5.6.8 8 2.4v11c-2.4-1.6-4.8-2.4-8-2.4s-5.6.8-8 2.4z" />
              <path d="M12 4.1v11" />
              <path d="M8.2 9.2h2.1M13.7 9.2h2.1" />
            </svg>
          </span>
          <span className="text-base">DeepScholar</span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          {links.map(({ href, label }) => {
            const active =
              href === "/"
                ? pathname === "/"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent-soft)] text-slate-900 shadow-sm dark:text-slate-100"
                    : "text-slate-600 hover:bg-[var(--surface)] hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
