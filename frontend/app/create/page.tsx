"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  formatUnits,
  parseEventLogs,
  parseUnits,
  zeroAddress,
  type Abi,
  type Address,
  type Hex,
} from "viem";
import {
  useConnect,
  useConnection,
  useConnectors,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import {
  readContract,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import {
  AUCTION_FACTORY_ADDRESS,
  FCE_ENCRYPTION_PUBLIC_KEY,
  FXRP_DECIMALS,
  FXRP_TOKEN_ADDRESS,
  auctionFactoryAbi,
  erc20Abi,
} from "@/lib/contracts";
import { encryptBid } from "@/lib/bidEncryption";
import { coston2, wagmiConfig } from "@/lib/wagmi";
import { useXrpUsdPrice } from "@/lib/useXrpUsdPrice";

const factoryAbi = auctionFactoryAbi as Abi;

type ReserveMode = "none" | "public" | "hidden";

type TxPhase =
  | "idle"
  | "encrypting"
  | "approving"
  | "approve-confirming"
  | "creating"
  | "create-confirming"
  | "done";

const DURATION_OPTIONS = [
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 6 * 3600 },
  { label: "24 hours", seconds: 24 * 3600 },
] as const;

// Settlement grace period is never shorter than this, even for very short
// auctions - the FCE module needs time to submit the signed result.
const MIN_GRACE_PERIOD = 3600;

const PHASE_GROUP: Record<TxPhase, number> = {
  idle: 0,
  encrypting: 1,
  approving: 2,
  "approve-confirming": 2,
  creating: 3,
  "create-confirming": 3,
  done: 4,
};

const PHASE_LABEL: Record<TxPhase, string> = {
  idle: "Create Auction",
  encrypting: "Encrypting reserve...",
  approving: "Approve FXRP in your wallet...",
  "approve-confirming": "Waiting for approval...",
  creating: "Confirm creation in your wallet...",
  "create-confirming": "Creating auction...",
  done: "Auction created",
};

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

function parsePositiveInt(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function formatFxrp(value: bigint) {
  const s = formatUnits(value, FXRP_DECIMALS);
  const [int, frac] = s.split(".");
  const trimmed = frac?.replace(/0+$/, "");
  return trimmed ? `${int}.${trimmed}` : int;
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
  "inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-6 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300";

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-zinc-900 dark:text-zinc-100"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap gap-1 self-start rounded-2xl border border-zinc-300 p-1 dark:border-zinc-700"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
            value === option.value
              ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type StepStatus = "pending" | "active" | "done" | "skipped" | "failed";

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
              : status === "skipped"
                ? "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
                : "border border-zinc-300 dark:border-zinc-600"
        }`}
      >
        {status === "active" ? (
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100" />
        ) : status === "done" ? (
          "✓"
        ) : status === "failed" ? (
          "×"
        ) : status === "skipped" ? (
          "–"
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

export default function CreateAuctionPage() {
  const router = useRouter();

  // Avoid hydration mismatch: the server always renders the disconnected
  // state, while the client may be reconnecting from stored state.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const { address, chainId, isConnected, status } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending: isConnecting } = useConnect();
  const { mutate: switchChain, isPending: isSwitching } = useSwitchChain();

  const [lotAmount, setLotAmount] = useState("");
  const [durationOption, setDurationOption] = useState("3600");
  const [customMinutes, setCustomMinutes] = useState("");
  const [graceInput, setGraceInput] = useState("");
  const [bidDeposit, setBidDeposit] = useState("");
  const [reserveMode, setReserveMode] = useState<ReserveMode>("hidden");
  const [reservePrice, setReservePrice] = useState("");

  const [attempted, setAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phase, setPhase] = useState<TxPhase>("idle");
  const [failedPhase, setFailedPhase] = useState<TxPhase | null>(null);
  const [approveNeeded, setApproveNeeded] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: fxrpBalance, isError: isBalanceError } = useReadContract({
    address: FXRP_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address ?? zeroAddress],
    chainId: coston2.id,
    query: { enabled: Boolean(address) },
  });

  const { price: xrpUsdPrice } = useXrpUsdPrice();

  // ---- Derived values ----

  const lotAmountWei = parseAmount(lotAmount, FXRP_DECIMALS);
  const bidDepositWei = parseAmount(bidDeposit, 18);
  const reserveWei = reserveMode === "none" ? null : parseAmount(reservePrice, 18);

  const customDurationMinutes =
    durationOption === "custom" ? parsePositiveInt(customMinutes) : null;
  const biddingDuration =
    durationOption === "custom"
      ? (customDurationMinutes ?? 0) * 60
      : Number(durationOption);

  const autoGracePeriod = Math.max(biddingDuration, MIN_GRACE_PERIOD);
  const graceOverride = graceInput.trim()
    ? parsePositiveInt(graceInput)
    : null;
  const gracePeriod = graceOverride ?? autoGracePeriod;

  // ---- Validation ----

  const errors: string[] = [];
  if (lotAmountWei === null || lotAmountWei <= BigInt(0))
    errors.push("Enter an FXRP lot amount greater than 0.");
  if (durationOption === "custom" && customDurationMinutes === null)
    errors.push("Enter a custom duration in whole minutes (at least 1).");
  if (graceInput.trim() && graceOverride === null)
    errors.push("Settlement grace period must be a whole number of seconds greater than 0.");
  if (bidDepositWei === null || bidDepositWei <= BigInt(0))
    errors.push("Enter a bid deposit in C2FLR greater than 0.");
  if (reserveMode !== "none" && (reserveWei === null || reserveWei <= BigInt(0)))
    errors.push("Enter a reserve price in C2FLR greater than 0.");

  const warnings: string[] = [];
  if (
    reserveMode !== "none" &&
    reserveWei !== null &&
    reserveWei > BigInt(0) &&
    bidDepositWei !== null &&
    bidDepositWei > BigInt(0) &&
    reserveWei > bidDepositWei
  )
    warnings.push(
      "The reserve price is higher than the bid deposit. Since the deposit caps the maximum possible winning price, no bid can ever reach this reserve.",
    );
  if (
    reserveMode !== "none" &&
    reserveWei !== null &&
    reserveWei > BigInt(0) &&
    bidDepositWei !== null &&
    reserveWei === bidDepositWei
  )
    warnings.push(
      "The reserve price equals the bid deposit - only a bid of exactly that amount could ever win. Consider leaving some margin between them.",
    );
  if (
    lotAmountWei !== null &&
    lotAmountWei > BigInt(0) &&
    fxrpBalance !== undefined &&
    lotAmountWei > fxrpBalance
  )
    warnings.push(
      "The lot amount exceeds your FXRP balance - the approval or auction creation will likely revert.",
    );

  // ---- Transaction flow ----

  async function handleSubmit() {
    setAttempted(true);
    if (errors.length > 0) return;
    if (!address || lotAmountWei === null || lotAmountWei <= BigInt(0)) return;
    if (bidDepositWei === null || bidDepositWei <= BigInt(0)) return;
    if (reserveMode !== "none" && (reserveWei === null || reserveWei <= BigInt(0)))
      return;

    const reserve = reserveWei ?? BigInt(0);

    setError(null);
    setFailedPhase(null);
    setApproveNeeded(null);
    setIsSubmitting(true);

    let currentPhase: TxPhase = "idle";
    const go = (next: TxPhase) => {
      currentPhase = next;
      setPhase(next);
    };

    try {
      let hasPublicMinPrice = false;
      let publicMinPrice = BigInt(0);
      let encryptedMinPriceBlob: Hex = "0x";

      if (reserveMode === "public") {
        hasPublicMinPrice = true;
        publicMinPrice = reserve;
      } else if (reserveMode === "hidden") {
        go("encrypting");
        const { encryptedBid } = await encryptBid(
          FCE_ENCRYPTION_PUBLIC_KEY,
          AUCTION_FACTORY_ADDRESS,
          reserve,
        );
        encryptedMinPriceBlob = encryptedBid;
      }

      // Step 1: approve the factory to pull the FXRP lot, if needed.
      const allowance = await readContract(wagmiConfig, {
        address: FXRP_TOKEN_ADDRESS,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, AUCTION_FACTORY_ADDRESS],
        chainId: coston2.id,
      });

      if (allowance < lotAmountWei) {
        setApproveNeeded(true);
        go("approving");
        const approveHash = await writeContract(wagmiConfig, {
          address: FXRP_TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [AUCTION_FACTORY_ADDRESS, lotAmountWei],
          chainId: coston2.id,
          account: address,
        });
        go("approve-confirming");
        const approveReceipt = await waitForTransactionReceipt(wagmiConfig, {
          hash: approveHash,
          chainId: coston2.id,
        });
        if (approveReceipt.status !== "success")
          throw new Error("The FXRP approval transaction reverted.");
      } else {
        setApproveNeeded(false);
      }

      // Step 2: create the auction.
      go("creating");
      const createHash = await writeContract(wagmiConfig, {
        address: AUCTION_FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: "createAuction",
        args: [
          FXRP_TOKEN_ADDRESS,
          lotAmountWei,
          BigInt(biddingDuration),
          BigInt(gracePeriod),
          bidDepositWei,
          hasPublicMinPrice,
          publicMinPrice,
          encryptedMinPriceBlob,
        ],
        chainId: coston2.id,
        account: address,
      });
      go("create-confirming");
      const createReceipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: createHash,
        chainId: coston2.id,
      });
      if (createReceipt.status !== "success")
        throw new Error("The createAuction transaction reverted.");

      go("done");

      // The receipt also contains FXRP Transfer logs, so only parse logs
      // emitted by the factory itself (parseEventLogs is strict by default).
      let auctionAddress: Address | undefined;
      try {
        const factoryLogs = createReceipt.logs.filter(
          (log) =>
            log.address.toLowerCase() ===
            AUCTION_FACTORY_ADDRESS.toLowerCase(),
        );
        const parsed = parseEventLogs({
          abi: factoryAbi,
          logs: factoryLogs,
          eventName: "AuctionCreated",
        });
        const args = parsed[0]?.args;
        if (args && typeof args === "object" && "auction" in args) {
          auctionAddress = (args as Record<string, unknown>)
            .auction as Address;
        }
      } catch {
        auctionAddress = undefined;
      }

      router.push(auctionAddress ? `/auctions/${auctionAddress}` : "/");
    } catch (err) {
      setFailedPhase(currentPhase);
      setError(errorMessage(err));
      setIsSubmitting(false);
    }
  }

  // ---- Step indicator ----

  function stepStatus(group: 1 | 2 | 3): StepStatus {
    const current = PHASE_GROUP[phase];
    if (failedPhase !== null && PHASE_GROUP[failedPhase] === group)
      return "failed";
    if (current > group) {
      if (group === 2 && approveNeeded === false) return "skipped";
      return "done";
    }
    if (current === group) return "active";
    return "pending";
  }

  function stepNote(group: 1 | 2 | 3): string | undefined {
    const status = stepStatus(group);
    if (status === "failed") return "This step failed - see the error below.";
    if (group === 1) {
      if (status === "active")
        return "Encrypting to the FCE module's public key, in your browser.";
      if (status === "done") return "Reserve encrypted - it never leaves this page in the clear.";
    }
    if (group === 2) {
      if (status === "active")
        return phase === "approving"
          ? "Confirm the approval in your wallet."
          : "Waiting for the approval to confirm on-chain.";
      if (status === "done") return "FXRP approved.";
      if (status === "skipped") return "Existing allowance already covers this lot.";
    }
    if (group === 3) {
      if (status === "active")
        return phase === "creating"
          ? "Confirm the transaction in your wallet."
          : "Waiting for the transaction to confirm on-chain.";
      if (status === "done") return "Auction created - redirecting...";
    }
    return undefined;
  }

  // ---- Render ----

  const xrpUsdHint =
    xrpUsdPrice !== undefined
      ? ` Reference price: 1 XRP ≈ $${xrpUsdPrice.toFixed(4)} (Flare FTSO, live).`
      : "";
  const lotValueHint =
    xrpUsdPrice !== undefined && lotAmountWei !== null && lotAmountWei > BigInt(0)
      ? ` This lot ≈ $${(Number(formatUnits(lotAmountWei, FXRP_DECIMALS)) * xrpUsdPrice).toFixed(2)}.`
      : "";
  // A failed balance read must not block submission (the balance is only
  // display/warning input) and must not show a stale number - say so plainly.
  const balanceHint =
    (address && fxrpBalance !== undefined
      ? `Your balance: ${formatFxrp(fxrpBalance)} FXRP. FXRP has 6 decimals, like XRP.`
      : address && isBalanceError
        ? "Could not load your FXRP balance - this does not block creating the auction. FXRP has 6 decimals, like XRP."
        : "FXRP has 6 decimals, like XRP.") +
    xrpUsdHint +
    lotValueHint;

  const lotAmountError =
    attempted && (lotAmountWei === null || lotAmountWei <= BigInt(0))
      ? "Enter an FXRP lot amount greater than 0."
      : undefined;
  const bidDepositError =
    attempted && (bidDepositWei === null || bidDepositWei <= BigInt(0))
      ? "Enter a bid deposit in C2FLR greater than 0."
      : undefined;
  const reserveError =
    attempted &&
    reserveMode !== "none" &&
    (reserveWei === null || reserveWei <= BigInt(0))
      ? "Enter a reserve price in C2FLR greater than 0."
      : undefined;

  const onWrongChain = isConnected && chainId !== coston2.id;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Create Auction
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Sell an FXRP lot in a sealed-bid auction on Flare Coston2.
          </p>
        </div>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="flex flex-col gap-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          {/* Token - fixed to FXRP */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Token
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                FXRP is the only FAsset supported today.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 font-mono text-xs text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
              FXRP {truncateAddress(FXRP_TOKEN_ADDRESS)}
            </span>
          </div>

          {/* Lot amount */}
          <Field
            label="Lot amount"
            htmlFor="lotAmount"
            hint={balanceHint}
            error={lotAmountError}
          >
            <div className="relative">
              <input
                id="lotAmount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="1000"
                value={lotAmount}
                disabled={isSubmitting}
                onChange={(e) => setLotAmount(e.target.value)}
                className={`${inputClass} pr-16`}
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-zinc-500 dark:text-zinc-400">
                FXRP
              </span>
            </div>
          </Field>

          {/* Bidding duration */}
          <Field
            label="Bidding duration"
            error={
              attempted && durationOption === "custom" && customDurationMinutes === null
                ? "Enter a custom duration in whole minutes (at least 1)."
                : undefined
            }
            hint="How long bidders can commit sealed bids once the auction opens."
          >
            <SegmentedControl
              ariaLabel="Bidding duration"
              value={durationOption}
              disabled={isSubmitting}
              onChange={setDurationOption}
              options={[
                ...DURATION_OPTIONS.map((d) => ({
                  value: String(d.seconds),
                  label: d.label,
                })),
                { value: "custom", label: "Custom" },
              ]}
            />
            {durationOption === "custom" && (
              <div className="relative mt-2 max-w-48">
                <input
                  id="customMinutes"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="90"
                  value={customMinutes}
                  disabled={isSubmitting}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  className={`${inputClass} pr-20`}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-zinc-500 dark:text-zinc-400">
                  minutes
                </span>
              </div>
            )}
          </Field>

          {/* Bid deposit */}
          <Field
            label="Bid deposit (C2FLR)"
            htmlFor="bidDeposit"
            error={bidDepositError}
            hint="Every bidder must post exactly this amount as collateral - it is also the maximum possible winning price. Because every bidder posts the same amount, the deposit itself never reveals anyone's real bid. Choose it based on the price range you expect."
          >
            <div className="relative">
              <input
                id="bidDeposit"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="50"
                value={bidDeposit}
                disabled={isSubmitting}
                onChange={(e) => setBidDeposit(e.target.value)}
                className={`${inputClass} pr-16`}
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-zinc-500 dark:text-zinc-400">
                C2FLR
              </span>
            </div>
          </Field>

          {/* Reserve price */}
          <Field
            label="Reserve price"
            hint={
              reserveMode === "public"
                ? "Visible to everyone on-chain. Bids below the reserve cannot win."
                : reserveMode === "hidden"
                  ? "The number is encrypted to the confidential compute module's key in your browser before anything is sent - not even this dApp's contract ever learns it. Only the FCE module can open it when it computes the result."
                  : "Any bid can win, no matter how low."
            }
          >
            <SegmentedControl
              ariaLabel="Reserve price mode"
              value={reserveMode}
              disabled={isSubmitting}
              onChange={setReserveMode}
              options={[
                { value: "none", label: "No reserve" },
                { value: "public", label: "Public reserve" },
                { value: "hidden", label: "Hidden reserve (recommended)" },
              ]}
            />
            {reserveMode !== "none" && (
              <div className="relative mt-2">
                <input
                  id="reservePrice"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="40"
                  value={reservePrice}
                  disabled={isSubmitting}
                  onChange={(e) => setReservePrice(e.target.value)}
                  className={`${inputClass} pr-16`}
                />
                <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-zinc-500 dark:text-zinc-400">
                  C2FLR
                </span>
              </div>
            )}
            {reserveError && reserveMode !== "none" && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {reserveError}
              </p>
            )}
          </Field>

          {/* Advanced */}
          <details className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <summary className="cursor-pointer text-sm font-medium text-zinc-900 select-none dark:text-zinc-100">
              Advanced
            </summary>
            <div className="mt-3">
              <Field
                label="Settlement grace period (seconds)"
                htmlFor="gracePeriod"
                error={
                  attempted && graceInput.trim() !== "" && graceOverride === null
                    ? "Settlement grace period must be a whole number of seconds greater than 0."
                    : undefined
                }
                hint={`Extra time after bidding ends during which the FCE module can submit the signed result before the auction can be reclaimed as expired. Defaults to your bidding duration with a 1 hour minimum - currently ${autoGracePeriod} seconds.`}
              >
                <input
                  id="gracePeriod"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={String(autoGracePeriod)}
                  value={graceInput}
                  disabled={isSubmitting}
                  onChange={(e) => setGraceInput(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </details>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40">
              {warnings.map((w) => (
                <p
                  key={w}
                  className="text-sm text-amber-800 dark:text-amber-300"
                >
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Validation errors */}
          {attempted && errors.length > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/40">
              {errors.map((err) => (
                <p
                  key={err}
                  className="text-sm text-red-700 dark:text-red-300"
                >
                  {err}
                </p>
              ))}
            </div>
          )}

          {/* Wallet-dependent submit area */}
          {!mounted || status === "reconnecting" ? (
            <button type="button" disabled className={primaryButtonClass}>
              Create Auction
            </button>
          ) : !isConnected ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={isConnecting}
                onClick={() => {
                  // Prefer the generic injected connector so it works with
                  // whatever wallet is actually installed (Rabby, Coinbase
                  // Wallet, MetaMask, ...), not just MetaMask specifically.
                  const connector =
                    connectors.find((c) => c.id === "injected") ??
                    connectors.find((c) => c.id === "metaMaskSDK") ??
                    connectors[0];
                  if (connector) connect({ connector });
                }}
                className={primaryButtonClass}
              >
                {isConnecting ? "Connecting..." : "Connect your wallet"}
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Connect your wallet to create an auction.
              </p>
            </div>
          ) : onWrongChain ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={isSwitching}
                onClick={() => switchChain({ chainId: coston2.id })}
                className="inline-flex h-10 items-center justify-center rounded-full bg-amber-500 px-6 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                {isSwitching ? "Switching..." : "Switch to Coston2"}
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                SealedFlare runs on Flare Coston2 - switch networks to
                continue.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className={primaryButtonClass}
              >
                {isSubmitting ? PHASE_LABEL[phase] : "Create Auction"}
              </button>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Two wallet confirmations may appear: one to approve the FXRP
                lot, one to create the auction.
              </p>
            </div>
          )}

          {/* Progress */}
          {phase !== "idle" && (
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                Progress
              </p>
              <ul className="flex flex-col gap-3">
                {reserveMode === "hidden" && (
                  <StepRow
                    title="Encrypt hidden reserve"
                    note={stepNote(1)}
                    status={stepStatus(1)}
                  />
                )}
                <StepRow
                  title="Step 1: Approve FXRP"
                  note={stepNote(2)}
                  status={stepStatus(2)}
                />
                <StepRow
                  title="Step 2: Create auction"
                  note={stepNote(3)}
                  status={stepStatus(3)}
                />
              </ul>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 dark:border-red-900/60 dark:bg-red-950/40">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {error}
              </p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Nothing was created. Fix the issue and try again.
              </p>
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
