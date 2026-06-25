"use client";

import { usePathname } from "next/navigation";

// Two-section header nav: top row is the product-area toggle
// (Pre-Arrangements vs. Headstones), bottom row is the section-aware
// sub-nav. Lives in the authenticated header in app/layout.tsx.

interface SubLink {
  href: string;
  label: string;
  external?: boolean;
}

const PREARRANGEMENT_LINKS: SubLink[] = [
  { href: "/", label: "Dashboard" },
  { href: "/new", label: "New estimate" },
  { href: "/web-estimates", label: "Web estimates" },
  { href: "/calculator", label: "Calculator" },
  { href: "/change-password", label: "Change password" },
];

const HEADSTONE_LINKS: SubLink[] = [
  { href: "/headstones", label: "Dashboard" },
  { href: "/change-password", label: "Change password" },
];

type Section = "prearrangement" | "headstone";

function sectionFor(pathname: string): Section {
  return pathname === "/headstones" || pathname.startsWith("/headstones/")
    ? "headstone"
    : "prearrangement";
}

export default function PrimaryNav({
  sheetsEditUrl,
}: {
  sheetsEditUrl?: string;
}) {
  const pathname = usePathname() || "/";
  const section = sectionFor(pathname);
  const links = section === "headstone" ? HEADSTONE_LINKS : PREARRANGEMENT_LINKS;

  const SectionBtn = ({
    href,
    label,
    active,
  }: {
    href: string;
    label: string;
    active: boolean;
  }) => (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider transition sm:text-sm " +
        (active
          ? "bg-gold-300 text-navy-900 shadow-sm"
          : "bg-white/10 text-mist-100 hover:bg-white/20")
      }
    >
      {label}
    </a>
  );

  return (
    <div className="mt-2 flex flex-col gap-2 sm:items-end">
      <div className="flex gap-2 sm:justify-end">
        <SectionBtn
          href="/"
          label="Pre-Arrangements"
          active={section === "prearrangement"}
        />
        <SectionBtn
          href="/headstones"
          label="Headstones"
          active={section === "headstone"}
        />
      </div>
      <nav className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-mist-100/90 sm:justify-end">
        {links.map((l) =>
          l.external ? (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-white hover:underline"
            >
              {l.label} ↗
            </a>
          ) : (
            <a
              key={l.href}
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={
                "underline-offset-2 hover:text-white hover:underline " +
                (pathname === l.href ? "text-white" : "")
              }
            >
              {l.label}
            </a>
          ),
        )}
        {section === "prearrangement" && sheetsEditUrl && (
          <a
            href={sheetsEditUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-white hover:underline"
          >
            Edit pricing ↗
          </a>
        )}
      </nav>
    </div>
  );
}
