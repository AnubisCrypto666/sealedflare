"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  formatUnits,
  isAddress,
  parseUnits,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import { useConnection, useReadContract, useReadContracts } from "wagmi";
import { waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { Countdown } from "@/components/Countdown";
import { FCE_URL, FXRP_DECIMALS, sealedBidAuctionAbi } from "@/lib/contracts";
import { encryptBid } from "@/lib/bidEncryption";
import { coston2, wagmiConfig } from "@/lib/wagmi";

const auctionAbi = sealedBidAuctionAbi as Abi;

// Fields batch-read from the auction contract. bidDeposit, publicMinPrice and
// finalPrice are 18-decimal native C2FLR values; only lotAmount uses
// FXRP_DECIMALS (6).
const AUCTION_FIELDS = [
  "seller", // 0
  "lotAmount", // 1
  "biddingDeadline", // 2
  "settlementDeadline", // 3
  "bidDeposit", // 4
  "hasPublicMinPrice", // 5
  "publicMinPrice", // 6
  "state", // 7
  "winner", // 8
  "finalPrice", // 9
  "bidderCount", // 10
  "lotClaimed", // 11
  "proceedsClaimed", // 12
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
    className:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
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

type Bid = {
  bidder: Address;
  commitmentHash: Hex;
  deposit: bigint;
  refundClaimed: boolean;
};

type BidPhase = "idle" | "encrypting" | "signing" | "confirming" | "done";

const BID_PHASE_GROUP: Record<BidPhase, number> = {
  idle: 0,
  encrypting: 1,
  signing: 2,
  confirming: 3,
  done: 4,
};

const BID_PHASE_LABEL: Record<BidPhase, string> = {
  idle: "Place sealed bid",
  encrypting: "Encrypting bid...",
  signing: "Confirm in your wallet...",
  confirming: "Confirming bid...",
  done: "Bid committed",
};

type ClaimAction = "claimLot" | "claimProceeds" | "reclaimLot" | "claimRefund";

type ClaimPhase = "signing" | "confirming";

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

function parseAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return parseUnits(trimmed, decimals);
  } catch {
    return null;
  }
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

const inputClass =
  "w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500";

const primaryButtonClass =
  "inline-flex h-10 items-center justify-center self-start rounded-full bg-zinc-900 px-6 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300";

type StepStatus = "pending" | "active" | "done" | "failed";

function StepRow({
  title,
  note,
  status,
}: {
  title: string;
  note?: string;
  status: StepStatus;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
          status === "done"
            ? "bg-green-600 text-white dark:bg-green-500"
            : status === "failed"
              ? "bg-red-600 text-white dark:bg-red-500"
              : "border border-zinc-300 dark:border-zinc-600"
        }`}
      >
        {status === "active" ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
        ) : status === "done" ? (
          "✓"
        ) : status === "failed" ? (
          "×"
        ) : null}
      </span>
      <div>
        <p
          className={`text-sm font-medium ${
            status === "pending"
              ? "text-zinc-400 dark:text-zinc-500"
              : "text-zinc-900 dark:text-zinc-100"
          }`}
        >
          {title}
        </p>
        {note && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {note}
          </p>
        )}
      </div>
    </li>
  );
}

function DetailRow({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="text-right">
        <span className="text-sm text-zinc-900 dark:text-zinc-100">
          {children}
        </span>
        {note && (
          <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
            {note}
          </span>
        )}
      </span>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ClaimRow({
  action,
  label,
  explanation,
  pendingClaim,
  claimPhase,
  disabled,
  onClaim,
}: {
  action: ClaimAction;
  label: string;
  explanation: string;
  pendingClaim: ClaimAction | null;
  claimPhase: ClaimPhase | null;
  disabled?: boolean;
  onClaim: (action: ClaimAction) => void;
}) {
  const isPending = pendingClaim === action;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <button
        type="button"
        disabled={disabled || pendingClaim !== null}
        onClick={() => onClaim(action)}
        className={primaryButtonClass}
      >
        {isPending
          ? claimPhase === "signing"
            ? "Confirm in your wallet..."
            : "Confirming..."
          : label}
      </button>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{explanation}</p>
    </div>
  );
}

export default function AuctionDetailPage() {
  const params = useParams<{ address: string }>();
  const validParam = isAddress(params.address);
  const auctionAddress = (
    validParam ? params.address : zeroAddress
  ) as Address;

  // Avoid hydration mismatch: the server always renders the disconnected
  // state, while the client may be reconnecting from stored state.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const { address, chainId, isConnected, status } = useConnection();

  // Ticking clock, used to detect that the bidding deadline has passed while
  // the auction is still in the Open state (settlement pending).
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const {
    data: fieldResults,
    isLoading: isLoadingFields,
    refetch: refetchFields,
  } = useReadContracts({
    contracts: AUCTION_FIELDS.map((functionName) => ({
      address: auctionAddress,
      abi: auctionAbi,
      functionName,
      chainId: coston2.id,
    })),
    query: { enabled: validParam },
  });

  const { data: myBidRaw, refetch: refetchMyBid } = useReadContract({
    address: auctionAddress,
    abi: auctionAbi,
    functionName: "bids",
    args: [address ?? zeroAddress],
    chainId: coston2.id,
    query: { enabled: validParam && Boolean(address) },
  });

  // ---- Bid form state ----
  const [price, setPrice] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phase, setPhase] = useState<BidPhase>("idle");
  const [failedPhase, setFailedPhase] = useState<BidPhase | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---- Claim state ----
  const [pendingClaim, setPendingClaim] = useState<ClaimAction | null>(null);
  const [claimPhase, setClaimPhase] = useState<ClaimPhase | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // ---- Derived auction data ----

  const seller = fieldResults?.[0]?.result as Address | undefined;
  const lotAmount = fieldResults?.[1]?.result as bigint | undefined;
  const biddingDeadline = fieldResults?.[2]?.result as bigint | undefined;
  const bidDeposit = fieldResults?.[4]?.result as bigint | undefined;
  const hasPublicMinPrice = fieldResults?.[5]?.result as boolean | undefined;
  const publicMinPrice = fieldResults?.[6]?.result as bigint | undefined;
  const auctionState = fieldResults?.[7]?.result as number | undefined;
  const winner = fieldResults?.[8]?.result as Address | undefined;
  const finalPrice = fieldResults?.[9]?.result as bigint | undefined;
  const bidderCount = fieldResults?.[10]?.result as bigint | undefined;
  const lotClaimed = fieldResults?.[11]?.result as boolean | undefined;
  const proceedsClaimed = fieldResults?.[12]?.result as boolean | undefined;

  const myBid = myBidRaw as Bid | undefined;
  const hasBid = Boolean(myBid && myBid.bidder !== zeroAddress);

  const sameAddress = (a?: Address, b?: Address) =>
    Boolean(a && b && a.toLowerCase() === b.toLowerCase());
  const isSeller = sameAddress(address, seller);
  const isWinner = sameAddress(address, winner);

  const biddingClosed =
    mounted &&
    auctionState === AUCTION_STATE.OPEN &&
    biddingDeadline !== undefined &&
    now >= Number(biddingDeadline);

  // ---- Bid flow ----

  const priceWei = parseAmount(price, 18);
  const priceError =
    attempted && (priceWei === null || priceWei <= BigInt(0))
      ? "Enter a bid price in C2FLR greater than 0."
      : attempted &&
          priceWei !== null &&
          bidDeposit !== undefined &&
          priceWei > bidDeposit
        ? `Your bid must not exceed the ${formatAmount(bidDeposit, 18)} C2FLR deposit.`
        : undefined;

  async function handleBid() {
    setAttempted(true);
    if (!address || bidDeposit === undefined) return;
    if (priceWei === null || priceWei <= BigInt(0) || priceWei > bidDeposit)
      return;

    setError(null);
    setFailedPhase(null);
    setIsSubmitting(true);

    let currentPhase: BidPhase = "idle";
    const go = (next: BidPhase) => {
      currentPhase = next;
      setPhase(next);
    };

    try {
      go("encrypting");
      const res = await fetch(`${FCE_URL}/identity`);
      if (!res.ok)
        throw new Error(
          `Could not reach the FCE module at ${FCE_URL} (HTTP ${res.status}). Is it running?`,
        );
      const identity = (await res.json()) as { encryptionPublicKey?: string };
      if (!identity.encryptionPublicKey)
        throw new Error("The FCE module did not return an encryption public key.");
      const { commitmentHash, encryptedBid } = await encryptBid(
        identity.encryptionPublicKey,
        address,
        priceWei,
      );

      go("signing");
      const hash = await writeContract(wagmiConfig, {
        address: auctionAddress,
        abi: auctionAbi,
        functionName: "commitBid",
        args: [commitmentHash, encryptedBid],
        value: bidDeposit,
        chainId: coston2.id,
        account: address,
      });
      go("confirming");
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        chainId: coston2.id,
      });
      if (receipt.status !== "success")
        throw new Error("The commitBid transaction reverted.");

      go("done");
      await Promise.all([refetchFields(), refetchMyBid()]);
      setIsSubmitting(false);
    } catch (err) {
      setFailedPhase(currentPhase);
      setError(errorMessage(err));
      setIsSubmitting(false);
    }
  }

  function bidStepStatus(group: 1 | 2 | 3): StepStatus {
    const current = BID_PHASE_GROUP[phase];
    if (failedPhase !== null && BID_PHASE_GROUP[failedPhase] === group)
      return "failed";
    if (current > group) return "done";
    if (current === group) return "active";
    return "pending";
  }

  function bidStepNote(group: 1 | 2 | 3): string | undefined {
    const stepStatus = bidStepStatus(group);
    if (stepStatus === "failed") return "This step failed - see the error below.";
    if (group === 1) {
      if (stepStatus === "active")
        return "Encrypting to the FCE module's public key, in your browser.";
      if (stepStatus === "done")
        return "Bid encrypted - it never leaves this page in the clear.";
    }
    if (group === 2) {
      if (stepStatus === "active")
        return "Confirm commitBid in your wallet - you post exactly the fixed deposit, not your bid price.";
      if (stepStatus === "done") return "Transaction submitted.";
    }
    if (group === 3) {
      if (stepStatus === "active")
        return "Waiting for the transaction to confirm on-chain.";
      if (stepStatus === "done") return "Bid committed.";
    }
    return undefined;
  }

  // ---- Claim flow ----

  async function handleClaim(action: ClaimAction) {
    if (!address) return;
    setClaimError(null);
    setPendingClaim(action);
    setClaimPhase("signing");
    try {
      const hash = await writeContract(wagmiConfig, {
        address: auctionAddress,
        abi: auctionAbi,
        functionName: action,
        chainId: coston2.id,
        account: address,
      });
      setClaimPhase("confirming");
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        chainId: coston2.id,
      });
      if (receipt.status !== "success")
        throw new Error("The transaction reverted.");
      await Promise.all([refetchFields(), refetchMyBid()]);
    } catch (err) {
      setClaimError(errorMessage(err));
    } finally {
      setPendingClaim(null);
      setClaimPhase(null);
    }
  }

  // ---- Early states: invalid address, loading, not found ----

  if (!validParam) {
    return <NotFound />;
  }

  if (isLoadingFields) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="h-72 animate-pulse rounded-2xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900" />
        </div>
      </main>
    );
  }

  // A real SealedBidAuction always returns a non-zero seller and a state.
  if (!seller || seller === zeroAddress || auctionState === undefined) {
    return <NotFound />;
  }

  const stateMeta =
    auctionState < STATE_META.length ? STATE_META[auctionState] : undefined;

  const onWrongChain = isConnected && chainId !== coston2.id;
  const terminalState =
    auctionState === AUCTION_STATE.SETTLED ||
    auctionState === AUCTION_STATE.NO_WINNER ||
    auctionState === AUCTION_STATE.EXPIRED;

  // ---- Claim conditions ----

  const showClaimLot =
    auctionState === AUCTION_STATE.SETTLED &&
    isWinner &&
    lotClaimed === false;
  const showClaimProceeds =
    auctionState === AUCTION_STATE.SETTLED &&
    isSeller &&
    proceedsClaimed === false;
  const showReclaimLot =
    (auctionState === AUCTION_STATE.NO_WINNER ||
      auctionState === AUCTION_STATE.EXPIRED) &&
    isSeller &&
    lotClaimed === false;
  const showClaimRefund =
    terminalState && hasBid && myBid !== undefined && !myBid.refundClaimed;

  const claimedNotes: string[] = [];
  if (auctionState === AUCTION_STATE.SETTLED && isWinner && lotClaimed)
    claimedNotes.push("You have claimed the FXRP lot.");
  if (auctionState === AUCTION_STATE.SETTLED && isSeller && proceedsClaimed)
    claimedNotes.push("You have claimed the proceeds.");
  if (
    (auctionState === AUCTION_STATE.NO_WINNER ||
      auctionState === AUCTION_STATE.EXPIRED) &&
    isSeller &&
    lotClaimed
  )
    claimedNotes.push("You have reclaimed the FXRP lot.");
  if (terminalState && hasBid && myBid?.refundClaimed)
    claimedNotes.push("You have claimed your refund.");

  const hasClaimContent =
    showClaimLot ||
    showClaimProceeds ||
    showReclaimLot ||
    showClaimRefund ||
    claimedNotes.length > 0;

  const refundLabel =
    myBid !== undefined &&
    auctionState === AUCTION_STATE.SETTLED &&
    isWinner &&
    finalPrice !== undefined
      ? `Claim refund - ${formatAmount(myBid.deposit - finalPrice, 18)} C2FLR (excess deposit)`
      : myBid !== undefined
        ? `Claim refund - ${formatAmount(myBid.deposit, 18)} C2FLR (full refund)`
        : "Claim refund";

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <Link
          href="/"
          className="self-start text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          &larr; Back to auctions
        </Link>

        {/* ---- Header / summary ---- */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full border border-zinc-300 px-3 py-1 font-mono text-xs break-all text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
              {auctionAddress}
            </span>
            {stateMeta && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${stateMeta.className}`}
              >
                {stateMeta.label}
              </span>
            )}
          </div>

          <p className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {lotAmount !== undefined
              ? `${formatAmount(lotAmount, FXRP_DECIMALS)} FXRP`
              : "—"}
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Sealed-bid lot on Flare Coston2
          </p>

          <div className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
            <DetailRow label="Seller">
              <span className="font-mono" title={seller}>
                {truncateAddress(seller)}
              </span>
            </DetailRow>
            <DetailRow
              label="Bid deposit"
              note="uniform deposit - hides real bid size"
            >
              {bidDeposit !== undefined
                ? `${formatAmount(bidDeposit, 18)} C2FLR`
                : "—"}
            </DetailRow>
            <DetailRow label="Reserve price">
              {hasPublicMinPrice === undefined ? (
                "—"
              ) : hasPublicMinPrice ? (
                `${
                  publicMinPrice !== undefined
                    ? formatAmount(publicMinPrice, 18)
                    : "—"
                } C2FLR`
              ) : (
                <span className="text-zinc-500 dark:text-zinc-400">
                  Hidden (only the confidential compute module knows)
                </span>
              )}
            </DetailRow>
            <DetailRow label="Bidders">
              {bidderCount !== undefined
                ? `${bidderCount.toString()} bidder${bidderCount === BigInt(1) ? "" : "s"}`
                : "—"}
            </DetailRow>
          </div>

          {auctionState === AUCTION_STATE.FUNDING && (
            <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              The seller has not funded the FXRP lot yet - bidding has not
              started.
            </p>
          )}

          {auctionState === AUCTION_STATE.OPEN &&
            biddingDeadline !== undefined && (
              <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-green-700 dark:border-zinc-800 dark:text-green-300">
                <Countdown deadline={Number(biddingDeadline)} />
              </p>
            )}

          {auctionState === AUCTION_STATE.SETTLED && (
            <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
              <p className="text-sm text-zinc-900 dark:text-zinc-100">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Winning price:{" "}
                </span>
                {finalPrice !== undefined
                  ? `${formatAmount(finalPrice, 18)} C2FLR`
                  : "—"}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Only the winning price is public - all other bids remain
                private forever.
              </p>
            </div>
          )}

          {auctionState === AUCTION_STATE.NO_WINNER && (
            <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              No valid bid was found.
            </p>
          )}

          {auctionState === AUCTION_STATE.EXPIRED && (
            <p className="mt-4 border-t border-zinc-100 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              This auction expired without a settled result.
            </p>
          )}
        </div>

        {/* ---- Bidding area (Open state only) ---- */}
        {auctionState === AUCTION_STATE.OPEN && (
          <SectionCard title="Place a sealed bid">
            {!mounted || status === "reconnecting" ? (
              <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            ) : biddingClosed ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Bidding has closed. Settlement is pending - this happens
                off-chain via the FCE module and a relayer script, not from
                this page.
              </p>
            ) : !isConnected ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Connect your wallet (top right) to place a sealed bid.
              </p>
            ) : onWrongChain ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                SealedFlare runs on Flare Coston2 - switch networks (top
                right) to place a sealed bid.
              </p>
            ) : myBid === undefined ? (
              <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
            ) : hasBid ? (
              <div
                className={`rounded-xl border px-4 py-3 ${
                  phase === "done"
                    ? "border-green-300 bg-green-50 dark:border-green-900/60 dark:bg-green-950/40"
                    : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/40"
                }`}
              >
                {phase === "done" && (
                  <p className="mb-1 text-sm font-medium text-green-700 dark:text-green-300">
                    Your sealed bid was committed.
                  </p>
                )}
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  You already committed a bid to this auction. Bids cannot be
                  changed or withdrawn before settlement.
                </p>
              </div>
            ) : (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleBid();
                }}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="bidPrice"
                    className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
                  >
                    Your price (C2FLR)
                  </label>
                  <div className="relative">
                    <input
                      id="bidPrice"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="25"
                      value={price}
                      disabled={isSubmitting}
                      onChange={(e) => setPrice(e.target.value)}
                      className={`${inputClass} pr-16`}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-zinc-500 dark:text-zinc-400">
                      C2FLR
                    </span>
                  </div>
                  {priceError ? (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {priceError}
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Your bid must not exceed the{" "}
                      {bidDeposit !== undefined
                        ? formatAmount(bidDeposit, 18)
                        : "—"}{" "}
                      C2FLR deposit - it stays private, only the confidential
                      compute module ever sees it.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={primaryButtonClass}
                  >
                    {isSubmitting ? BID_PHASE_LABEL[phase] : "Place sealed bid"}
                  </button>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    You post exactly the{" "}
                    {bidDeposit !== undefined
                      ? formatAmount(bidDeposit, 18)
                      : "—"}{" "}
                    C2FLR deposit, not your bid price. The deposit is refunded
                    after settlement - the winner only pays the winning price.
                  </p>
                </div>

                {phase !== "idle" && (
                  <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                      Progress
                    </p>
                    <ul className="flex flex-col gap-3">
                      <StepRow
                        title="Encrypt bid"
                        note={bidStepNote(1)}
                        status={bidStepStatus(1)}
                      />
                      <StepRow
                        title="Confirm in wallet"
                        note={bidStepNote(2)}
                        status={bidStepStatus(2)}
                      />
                      <StepRow
                        title="Wait for confirmation"
                        note={bidStepNote(3)}
                        status={bidStepStatus(3)}
                      />
                    </ul>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/40">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      {error}
                    </p>
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      No bid was committed. Fix the issue and try again.
                    </p>
                  </div>
                )}
              </form>
            )}
          </SectionCard>
        )}

        {/* ---- Claims ---- */}
        {isConnected && hasClaimContent && (
          <SectionCard title="Claims">
            {showClaimLot && (
              <ClaimRow
                action="claimLot"
                label="Claim your FXRP lot"
                explanation="You won this auction. Claim the FXRP lot to your wallet."
                pendingClaim={pendingClaim}
                claimPhase={claimPhase}
                disabled={onWrongChain}
                onClaim={handleClaim}
              />
            )}
            {showClaimProceeds && (
              <ClaimRow
                action="claimProceeds"
                label={`Claim proceeds (${
                  finalPrice !== undefined
                    ? formatAmount(finalPrice, 18)
                    : "—"
                } C2FLR)`}
                explanation="You are the seller. Claim the winning price paid by the winner."
                pendingClaim={pendingClaim}
                claimPhase={claimPhase}
                disabled={onWrongChain}
                onClaim={handleClaim}
              />
            )}
            {showReclaimLot && (
              <ClaimRow
                action="reclaimLot"
                label="Reclaim your FXRP lot"
                explanation="The auction ended without a settled sale - reclaim your FXRP lot."
                pendingClaim={pendingClaim}
                claimPhase={claimPhase}
                disabled={onWrongChain}
                onClaim={handleClaim}
              />
            )}
            {showClaimRefund && (
              <ClaimRow
                action="claimRefund"
                label={refundLabel}
                explanation={
                  auctionState === AUCTION_STATE.SETTLED && isWinner
                    ? "You won - get back the part of your deposit above the winning price."
                    : "Your sealed bid did not win - get your full deposit back."
                }
                pendingClaim={pendingClaim}
                claimPhase={claimPhase}
                disabled={onWrongChain}
                onClaim={handleClaim}
              />
            )}

            {claimedNotes.map((note) => (
              <p
                key={note}
                className="text-sm text-zinc-500 dark:text-zinc-400"
              >
                ✓ {note}
              </p>
            ))}

            {onWrongChain && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Switch to Coston2 (top right) to claim.
              </p>
            )}

            {claimError && (
              <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/40">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  {claimError}
                </p>
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 rounded-2xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
        <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Auction not found
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This address is not a valid SealedFlare auction on Flare Coston2 -
          the link may be mistyped or the auction may not exist.
        </p>
        <Link
          href="/"
          className="inline-flex h-9 items-center justify-center rounded-full bg-zinc-900 px-4 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Back to auctions
        </Link>
      </div>
    </main>
  );
}
