"use client";

import { useSyncExternalStore } from "react";
import { formatUnits } from "viem";
import {
  useBalance,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { coston2 } from "@/lib/wagmi";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectWallet() {
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
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain, isPending: isSwitching } = useSwitchChain();

  const { data: balance } = useBalance({
    address,
    chainId: coston2.id,
  });

  const buttonBase =
    "inline-flex h-9 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

  if (!mounted || status === "reconnecting") {
    return (
      <button
        type="button"
        disabled
        className={`${buttonBase} bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900`}
      >
        Connect Wallet
      </button>
    );
  }

  if (!isConnected) {
    const metaMaskConnector = connectors.find((c) => c.id === "metaMaskSDK");
    const connector = metaMaskConnector ?? connectors[0];

    return (
      <button
        type="button"
        disabled={!connector || isConnecting}
        onClick={() => connector && connect({ connector })}
        className={`${buttonBase} bg-zinc-900 text-zinc-50 hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300`}
      >
        {isConnecting ? "Connecting..." : "Connect Wallet"}
      </button>
    );
  }

  if (chainId !== coston2.id) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isSwitching}
          onClick={() => switchChain({ chainId: coston2.id })}
          className={`${buttonBase} bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-600 dark:hover:bg-amber-500`}
        >
          {isSwitching ? "Switching..." : "Switch to Coston2"}
        </button>
        <button
          type="button"
          onClick={() => disconnect()}
          className={`${buttonBase} border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900`}
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {balance && (
        <span className="hidden text-sm tabular-nums text-zinc-600 dark:text-zinc-400 sm:inline">
          {Number(formatUnits(balance.value, balance.decimals)).toFixed(4)}{" "}
          {balance.symbol}
        </span>
      )}
      <span className="rounded-full border border-zinc-300 px-3 py-1.5 font-mono text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-100">
        {address ? truncateAddress(address) : ""}
      </span>
      <button
        type="button"
        onClick={() => disconnect()}
        className={`${buttonBase} border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900`}
      >
        Disconnect
      </button>
    </div>
  );
}
