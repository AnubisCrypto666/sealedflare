"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// TEMPORARY design-decision scaffold - not wired into the real app.
//
// Three candidate directions for applying the Flare brand kit (Flare Pink
// #E62058 + its tint/shade scale) as an accent on the existing dark UI.
// Every demo below is a copy of real app markup (AuctionCard, SiteHeader,
// ConnectWallet, filter pills, state badges, bid-form input) with the dark:
// variant baked in directly, so this preview renders the dark theme
// identically regardless of the OS color scheme. The real pages are
// untouched; once a direction is picked, it gets applied there and this
// file is deleted.
// ---------------------------------------------------------------------------

// Literal hex values from the Flare brand kit, used for the swatch chips.
// Component classes below use literal Tailwind arbitrary values instead of
// interpolating these, because the Tailwind scanner only sees literal class
// names.
const FLARE = {
  pink: "#E62058",
  bright: "#F73C68",
  soft: "#FD6F8C",
} as const;

// Per-direction accent classes. Everything NOT listed here (card surfaces,
// borders, neutral text, semantic badge colors) is shared base markup and
// stays identical across directions, so the only variable is the accent.
type DirectionStyles = {
  wordmark: string;
  connectButton: string;
  primaryButton: string;
  filterActive: string;
  openBadge: string;
  cardExtra: string;
  cardGlow: string;
  cardHairline: string;
  countdown: string;
  countdownDot: string;
  input: string;
};

type Direction = {
  id: string;
  name: string;
  tagline: string;
  rationale: string;
  shades: { hex: string; use: string }[];
  styles: DirectionStyles;
};

// Shared base classes (dark-theme values from the real app, dark: removed).
const connectBase =
  "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors";
const primaryBase =
  "inline-flex min-h-10 items-center justify-center self-start rounded-full px-6 py-2 text-sm font-medium transition-colors";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-full border border-zinc-700 px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-900";
const inputBase =
  "w-full max-w-sm rounded-xl border bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors";
const zincWordmark = "text-base font-semibold tracking-tight text-zinc-50";
const zincConnect = `${connectBase} bg-zinc-50 text-zinc-900 hover:bg-zinc-300`;
const zincPrimary = `${primaryBase} bg-zinc-50 text-zinc-900 hover:bg-zinc-300`;
const zincFilterActive = "bg-zinc-50 text-zinc-900";
const zincInput = `${inputBase} border-zinc-700 focus:border-zinc-500`;
const defaultOpenBadge = "bg-green-900/40 text-green-300";
const defaultCountdown = "text-green-300";

const DIRECTIONS: Record<string, Direction> = {
  signal: {
    id: "signal",
    name: "A - Signal",
    tagline: "Pink is the color of doing.",
    rationale:
      "The entire accent budget goes to actions: primary buttons take solid Flare Pink #E62058 and brighten to #F73C68 on hover, and form focus borders turn pink, so the one thing you can do on any screen is always the pink thing. Badges, cards and filters keep today's semantic colors untouched - the pink never competes with content. The safest, most product-like option, and the one most instantly recognizable as Flare.",
    shades: [
      { hex: FLARE.pink, use: "button fill" },
      { hex: FLARE.bright, use: "hover / focus" },
    ],
    styles: {
      wordmark: zincWordmark,
      connectButton: `${connectBase} bg-[#E62058] text-white hover:bg-[#F73C68]`,
      primaryButton: `${primaryBase} bg-[#E62058] text-white hover:bg-[#F73C68]`,
      filterActive: zincFilterActive,
      openBadge: defaultOpenBadge,
      cardExtra: "",
      cardGlow: "hidden",
      cardHairline: "hidden",
      countdown: defaultCountdown,
      countdownDot: "hidden",
      input: `${inputBase} border-zinc-700 focus:border-[#E62058]`,
    },
  },
  ember: {
    id: "ember",
    name: "B - Ember",
    tagline: "The brand as light, not paint.",
    rationale:
      "Nothing is repainted: buttons, badges and surfaces keep today's zinc, and the brand shows up only as illumination - a gradient hairline along the top of each card, a soft pink glow that fades in behind a card on hover, a glowing countdown, and a pink gradient on the wordmark. The brighter tints do the work because light colors read as glow on dark backgrounds. Deliberately no solid pink surfaces anywhere: at rest, the app looks almost unchanged, and the flare appears on interaction.",
    shades: [
      { hex: FLARE.pink, use: "glow + hairline" },
      { hex: FLARE.bright, use: "countdown" },
      { hex: FLARE.soft, use: "gradient end" },
    ],
    styles: {
      wordmark:
        "bg-linear-to-r from-[#E62058] via-[#F73C68] to-[#FD6F8C] bg-clip-text text-base font-semibold tracking-tight text-transparent",
      connectButton: zincConnect,
      primaryButton: zincPrimary,
      filterActive: zincFilterActive,
      openBadge: defaultOpenBadge,
      cardExtra: "",
      cardGlow:
        "pointer-events-none absolute -inset-1 rounded-3xl bg-[#E62058]/20 opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100",
      cardHairline:
        "pointer-events-none absolute inset-x-5 top-0 h-px bg-linear-to-r from-transparent via-[#E62058]/80 to-transparent",
      countdown:
        "text-[#F73C68] drop-shadow-[0_0_14px_rgba(230,32,88,0.45)]",
      countdownDot: "hidden",
      input: zincInput,
    },
  },
  livewire: {
    id: "livewire",
    name: "C - Live wire",
    tagline: "Pink means something is happening right now.",
    rationale:
      "The accent is reserved strictly for live state: the Open badge, the active filter pill and the running countdown (with a pulsing live dot) take #E62058/#F73C68, while every button, link and static element stays zinc. When nothing on screen is live, the UI is fully monochrome - the brand appears exactly when there is something to act on, which also makes it a status signal rather than decoration. Avoided pink on actions so the color keeps a single, teachable meaning.",
    shades: [
      { hex: FLARE.pink, use: "pill + badge fill" },
      { hex: FLARE.bright, use: "countdown + dot" },
      { hex: FLARE.soft, use: "badge text" },
    ],
    styles: {
      wordmark: zincWordmark,
      connectButton: zincConnect,
      primaryButton: zincPrimary,
      filterActive: "bg-[#E62058] text-white",
      openBadge:
        "bg-[#E62058]/15 text-[#FD6F8C] ring-1 ring-inset ring-[#E62058]/30",
      cardExtra: "",
      cardGlow: "hidden",
      cardHairline: "hidden",
      countdown: "text-[#F73C68]",
      countdownDot: "",
      input: zincInput,
    },
  },
};

const DIRECTION_ORDER = ["signal", "ember", "livewire"];

// ---- Demo components: copies of real app markup, accent classes injected --

function Caption({ children }: { children: string }) {
  return (
    <p className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
      {children}
    </p>
  );
}

function Swatch({ hex, use }: { hex: string; use: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
      <span
        className="h-3.5 w-3.5 rounded-full border border-zinc-700"
        style={{ backgroundColor: hex }}
      />
      <span className="font-mono text-zinc-500">{hex}</span>
      {use}
    </span>
  );
}

function DemoHeader({ s }: { s: DirectionStyles }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800">
      <div className="flex h-14 items-center justify-between gap-4 bg-black/80 px-4 backdrop-blur">
        <span className={s.wordmark}>SealedFlare</span>
        <nav className="flex items-center gap-5">
          <span className="hidden text-sm text-zinc-400 transition-colors hover:text-zinc-50 sm:inline">
            Auctions
          </span>
          <span className="hidden text-sm text-zinc-400 transition-colors hover:text-zinc-50 sm:inline">
            Create Auction
          </span>
          <button type="button" className={s.connectButton}>
            Connect Wallet
          </button>
        </nav>
      </div>
      <div className="flex h-14 items-center justify-between gap-4 border-t border-zinc-800 bg-black/80 px-4">
        <span className={s.wordmark}>SealedFlare</span>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm tabular-nums text-zinc-400 sm:inline">
            42.0137 C2FLR
          </span>
          <span className="rounded-full border border-zinc-700 px-3 py-1 font-mono text-xs text-zinc-100">
            0x8aF3...9c2d
          </span>
          <button type="button" className={secondaryButtonClass}>
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

function DemoBadges({ s }: { s: DirectionStyles }) {
  const badges = [
    { label: "Funding", className: "bg-amber-900/40 text-amber-300" },
    { label: "Open", className: s.openBadge },
    { label: "Settled", className: "bg-blue-900/40 text-blue-300" },
    { label: "No Winner", className: "bg-zinc-800 text-zinc-400" },
    { label: "Expired", className: "bg-zinc-800 text-zinc-400" },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`rounded-full px-3 py-1 text-xs font-medium ${b.className}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

const FILTER_DEMO = [
  { label: "Open", count: 3 },
  { label: "Settled", count: 1 },
  { label: "Ended", count: 2 },
  { label: "All", count: 6 },
];

function DemoFilters({ s }: { s: DirectionStyles }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-zinc-700 p-1">
      {FILTER_DEMO.map((tab) => {
        const active = tab.label === "Open";
        return (
          <button
            key={tab.label}
            type="button"
            aria-pressed={active}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active
                ? s.filterActive
                : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-xs tabular-nums opacity-60">
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DemoCard({
  s,
  variant,
}: {
  s: DirectionStyles;
  variant: "open" | "settled";
}) {
  const open = variant === "open";
  return (
    <div className="group relative">
      <div aria-hidden className={s.cardGlow} />
      <div
        className={`relative flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-600 ${s.cardExtra}`}
      >
        <div aria-hidden className={s.cardHairline} />
        <div className="flex items-center justify-between gap-2">
          <span className="rounded-full border border-zinc-700 px-3 py-1 font-mono text-xs text-zinc-100">
            {open ? "0x7A9c...F42b" : "0x31De...b807"}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              open ? s.openBadge : "bg-blue-900/40 text-blue-300"
            }`}
          >
            {open ? "Open" : "Settled"}
          </span>
        </div>

        <p className="text-xl font-semibold tracking-tight text-zinc-50">
          {open ? "12,500 FXRP" : "800 FXRP"}
        </p>

        <div>
          <p className="text-sm text-zinc-100">
            <span className="text-zinc-400">Bid collateral: </span>
            {open ? "25 C2FLR" : "10 C2FLR"}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">
            uniform deposit - hides real bid size
          </p>
        </div>

        {open ? (
          <p className={`flex items-center text-sm ${s.countdown}`}>
            <span
              className={`relative mr-1.5 inline-flex h-2 w-2 ${s.countdownDot}`}
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E62058] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F73C68]" />
            </span>
            <span className="tabular-nums">1d 4h 23m left</span>
          </p>
        ) : (
          <div>
            <p className="text-sm text-zinc-100">
              <span className="text-zinc-400">Winning price: </span>
              7.5 C2FLR
            </p>
            <p className="mt-0.5 text-xs text-zinc-400">
              Only the winning price is public.
            </p>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-400">
          <span>
            Seller <span className="font-mono">0x1B4e...8aF0</span>
          </span>
          <span>{open ? "3 bidders" : "5 bidders"}</span>
        </div>
      </div>
    </div>
  );
}

function DemoActions({ s }: { s: DirectionStyles }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={s.primaryButton}>
          Place sealed bid
        </button>
        <button type="button" className={secondaryButtonClass}>
          Disconnect
        </button>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700"
        >
          Try again
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="brandPreviewBid"
          className="text-sm font-medium text-zinc-100"
        >
          Your price (C2FLR) - click the input to try the focus state
        </label>
        <div className="relative max-w-sm">
          <input
            id="brandPreviewBid"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder="25"
            className={`${s.input} pr-16`}
          />
          <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-zinc-400">
            C2FLR
          </span>
        </div>
      </div>
    </div>
  );
}

// ---- Page -----------------------------------------------------------------

export default function BrandPreviewPage() {
  const [activeId, setActiveId] = useState("signal");
  const direction = DIRECTIONS[activeId];
  const s = direction.styles;

  return (
    <main className="w-full flex-1 bg-[#0a0a0a]">
      <div className="mx-auto w-full max-w-5xl px-4 py-10">
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
              Brand accent preview
            </h1>
            <span className="rounded-full bg-[#E62058]/15 px-3 py-1 text-xs font-medium text-[#FD6F8C] ring-1 ring-inset ring-[#E62058]/30">
              Temporary scaffold - real pages untouched
            </span>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Three directions for bringing Flare Pink (#E62058) into the
            existing dark UI as an accent. Each one is applied to copies of
            real components - header with wallet button, state badges, filter
            pills, auction cards, buttons and the bid input - rendered with
            their dark-theme styles regardless of your OS setting. The dark
            background and zinc palette stay exactly as they are in the app.
          </p>
        </div>

        <div
          role="group"
          aria-label="Preview direction"
          className="mb-8 inline-flex flex-wrap gap-1 rounded-full border border-zinc-700 p-1"
        >
          {DIRECTION_ORDER.map((id) => {
            const d = DIRECTIONS[id];
            const active = id === activeId;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveId(id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#E62058] text-white"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {d.name}
              </button>
            );
          })}
        </div>

        <section key={direction.id} className="flex flex-col gap-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
              {direction.name}
              <span className="ml-2 text-base font-normal text-zinc-400">
                {direction.tagline}
              </span>
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">
              {direction.rationale}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {direction.shades.map((shade) => (
                <Swatch key={shade.hex} hex={shade.hex} use={shade.use} />
              ))}
            </div>
          </div>

          <div>
            <Caption>Header - disconnected and connected</Caption>
            <DemoHeader s={s} />
          </div>

          <div>
            <Caption>Auction state badges</Caption>
            <DemoBadges s={s} />
          </div>

          <div>
            <Caption>Filter pills (Open active)</Caption>
            <DemoFilters s={s} />
          </div>

          <div>
            <Caption>Auction cards - hover them</Caption>
            <div className="grid gap-4 sm:grid-cols-2">
              <DemoCard s={s} variant="open" />
              <DemoCard s={s} variant="settled" />
            </div>
          </div>

          <div>
            <Caption>Buttons and bid input</Caption>
            <DemoActions s={s} />
          </div>
        </section>
      </div>
    </main>
  );
}
