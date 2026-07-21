"use client";

import Link from "next/link";
import { ConnectWallet } from "./ConnectWallet";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          className="bg-linear-to-r from-[#E62058] via-[#F73C68] to-[#FD6F8C] bg-clip-text text-base font-semibold tracking-tight text-transparent"
        >
          SealedFlare
        </Link>
        <nav className="flex items-center gap-5">
          <Link
            href="/"
            className="hidden text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 sm:inline"
          >
            Auctions
          </Link>
          <Link
            href="/create"
            className="hidden text-sm text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 sm:inline"
          >
            Create Auction
          </Link>
          <ConnectWallet />
        </nav>
      </div>
    </header>
  );
}
