"use client";

import Link from "next/link";
import { useState } from "react";
import { formatUnits, type Abi, type Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { Countdown } from "@/components/Countdown";
import {
  AUCTION_FACTORY_ADDRESS,
  FXRP_DECIMALS,
  auctionFactoryAbi,
  sealedBidAuctionAbi,
} from "@/lib/contracts";
import { coston2 } from "@/lib/wagmi";

const factoryAbi = auctionFactoryAbi as Abi;
const auctionAbi = sealedBidAuctionAbi as Abi;

// Fields batch-read per auction. bidDeposit, biddingDeadline and finalPrice are
// 18-decimal native C2FLR values; only lotAmount uses FXRP_DECIMALS (6).
const AUCTION_FIELDS = [
  "seller",
  "lotAmount",
  "biddingDeadline",
  "bidDeposit",
  "state",
  "finalPrice",
  "bidderCount",
] as const;

const AUCTION_STATE = {
  FUNDING: 0,
  OPEN: 1,
  SETTLED: 2,
  NO_WINNER: 3,
  EXPIRED: 4,
} as const;

const STATE_META = [
  {
    label: "Funding",
    className:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  {
    label: "Open",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  },
  {
    label: "Settled",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  {
    label: "No Winner",
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
  {
    label: "Expired",
    className: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  },
] as const;

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatAmount(value: bigint, decimals: number) {
  const s = formatUnits(value, decimals);
  const [int, frac] = s.split(".");
  const grouped = Number(int).toLocaleString("en-US");
  if (!frac) return grouped;
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${grouped}.${trimmed}` : grouped;
}

function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "shortMessage" in error &&
    typeof (error as { shortMessage?: unknown }).shortMessage === "string"
  ) {
    return (error as { shortMessage: string }).shortMessage;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

type FilterTab = "open" | "settled" | "ended" | "all";

const FILTER_TABS: readonly { value: FilterTab; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "settled", label: "Settled" },
  { value: "ended", label: "Ended" },
  { value: "all", label: "All" },
];

// Funding counts as live alongside Open: the auction exists, it is just
// waiting for the seller to fund the FXRP lot before bidding starts.
function matchesFilter(auction: Auction, filter: FilterTab): boolean {
  switch (filter) {
    case "open":
      return (
        auction.state === AUCTION_STATE.FUNDING ||
        auction.state === AUCTION_STATE.OPEN
      );
    case "settled":
      return auction.state === AUCTION_STATE.SETTLED;
    case "ended":
      return (
        auction.state === AUCTION_STATE.NO_WINNER ||
        auction.state === AUCTION_STATE.EXPIRED
      );
    case "all":
      return true;
  }
}

type Auction = {
  address: Address;
  seller?: Address;
  lotAmount?: bigint;
  biddingDeadline?: bigint;
  bidDeposit?: bigint;
  state?: number;
  finalPrice?: bigint;
  bidderCount?: bigint;
};

function AuctionCard({ auction }: { auction: Auction }) {
  const stateMeta =
    auction.state !== undefined && auction.state < STATE_META.length
      ? STATE_META[auction.state]
      : undefined;

  return (
    <Link
      href={`/auctions/${auction.address}`}
      className="group flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-zinc-300 px-3 py-1 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
          {truncateAddress(auction.address)}
        </span>
        {stateMeta && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${stateMeta.className}`}
          >
            {stateMeta.label}
          </span>
        )}
      </div>

      <p className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {auction.lotAmount !== undefined
          ? `${formatAmount(auction.lotAmount, FXRP_DECIMALS)} FXRP`
          : "—"}
      </p>

      <div>
        <p className="text-sm text-zinc-900 dark:text-zinc-100">
          <span className="text-zinc-500 dark:text-zinc-400">
            Bid collateral:{" "}
          </span>
          {auction.bidDeposit !== undefined
            ? `${formatAmount(auction.bidDeposit, 18)} C2FLR`
            : "—"}
        </p>
        <p
          className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400"
          title="Every bidder posts the same deposit, so the on-chain amount never reveals the real bid size."
        >
          uniform deposit - hides real bid size
        </p>
      </div>

      {auction.state === AUCTION_STATE.OPEN &&
        auction.biddingDeadline !== undefined && (
          <p className="text-sm text-green-700 dark:text-green-300">
            <Countdown deadline={Number(auction.biddingDeadline)} />
          </p>
        )}

      {auction.state === AUCTION_STATE.SETTLED &&
        auction.finalPrice !== undefined && (
          <div>
            <p className="text-sm text-zinc-900 dark:text-zinc-100">
              <span className="text-zinc-500 dark:text-zinc-400">
                Winning price:{" "}
              </span>
              {formatAmount(auction.finalPrice, 18)} C2FLR
            </p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Only the winning price is public.
            </p>
          </div>
        )}

      <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        <span>
          Seller{" "}
          <span className="font-mono">
            {auction.seller ? truncateAddress(auction.seller) : "—"}
          </span>
        </span>
        <span>
          {auction.bidderCount !== undefined
            ? `${auction.bidderCount.toString()} bidder${auction.bidderCount === BigInt(1) ? "" : "s"}`
            : "—"}
        </span>
      </div>
    </Link>
  );
}

function LoadingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-48 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
      <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
        No auctions yet
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Be the first to sell an FXRP lot in a sealed-bid auction.
      </p>
      <Link
        href="/create"
        className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Create Auction
      </Link>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-300 bg-red-50 px-6 py-16 text-center dark:border-red-900/60 dark:bg-red-950/40">
      <p className="text-lg font-medium text-red-700 dark:text-red-300">
        Could not load auctions
      </p>
      <p className="max-w-md text-sm break-words text-red-600 dark:text-red-400">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Try again
      </button>
    </div>
  );
}

export default function AuctionsPage() {
  const {
    data: auctionAddresses,
    isLoading: isLoadingAddresses,
    isError: isAddressesError,
    error: addressesError,
    refetch: refetchAddresses,
  } = useReadContract({
    address: AUCTION_FACTORY_ADDRESS,
    abi: factoryAbi,
    functionName: "getAllAuctions",
    chainId: coston2.id,
  });

  const addresses = (auctionAddresses as Address[] | undefined) ?? [];

  const {
    data: fieldResults,
    isLoading: isLoadingFields,
    isError: isFieldsError,
    error: fieldsError,
    refetch: refetchFields,
  } = useReadContracts({
    contracts: addresses.flatMap((address) =>
      AUCTION_FIELDS.map((functionName) => ({
        address,
        abi: auctionAbi,
        functionName,
        chainId: coston2.id,
      })),
    ),
    query: { enabled: addresses.length > 0 },
  });

  const isLoading =
    isLoadingAddresses || (addresses.length > 0 && isLoadingFields);

  const auctions: Auction[] = addresses.map((address, i) => {
    const base = i * AUCTION_FIELDS.length;
    return {
      address,
      seller: fieldResults?.[base]?.result as Address | undefined,
      lotAmount: fieldResults?.[base + 1]?.result as bigint | undefined,
      biddingDeadline: fieldResults?.[base + 2]?.result as bigint | undefined,
      bidDeposit: fieldResults?.[base + 3]?.result as bigint | undefined,
      state: fieldResults?.[base + 4]?.result as number | undefined,
      finalPrice: fieldResults?.[base + 5]?.result as bigint | undefined,
      bidderCount: fieldResults?.[base + 6]?.result as bigint | undefined,
    };
  });

  const [filter, setFilter] = useState<FilterTab>("open");

  const counts: Record<FilterTab, number> = {
    open: 0,
    settled: 0,
    ended: 0,
    all: auctions.length,
  };
  for (const auction of auctions) {
    if (matchesFilter(auction, "open")) counts.open += 1;
    if (matchesFilter(auction, "settled")) counts.settled += 1;
    if (matchesFilter(auction, "ended")) counts.ended += 1;
  }

  const filteredAuctions =
    filter === "all"
      ? auctions
      : auctions.filter((auction) => matchesFilter(auction, filter));

  const loadError = isAddressesError ? addressesError : fieldsError;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Auctions
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Sealed-bid FXRP auctions on Flare Coston2.
          </p>
        </div>
        <Link
          href="/create"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 px-4 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Create Auction
        </Link>
      </div>

      {isLoading ? (
        <LoadingGrid />
      ) : isAddressesError || isFieldsError ? (
        <ErrorState
          message={`${errorMessage(loadError)} Check your connection and try again.`}
          onRetry={() => {
            if (isAddressesError) void refetchAddresses();
            if (isFieldsError) void refetchFields();
          }}
        />
      ) : auctions.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div
            role="group"
            aria-label="Filter auctions"
            className="mb-4 inline-flex flex-wrap gap-1 rounded-full border border-zinc-300 p-1 dark:border-zinc-700"
          >
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                aria-pressed={filter === tab.value}
                onClick={() => setFilter(tab.value)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  filter === tab.value
                    ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                {tab.label}
                <span
                  className={`ml-1.5 text-xs tabular-nums ${
                    filter === tab.value
                      ? "text-zinc-300 dark:text-zinc-600"
                      : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {counts[tab.value]}
                </span>
              </button>
            ))}
          </div>

          {filteredAuctions.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 px-6 py-16 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
              No auctions in this category.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAuctions.map((auction) => (
                <AuctionCard key={auction.address} auction={auction} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
