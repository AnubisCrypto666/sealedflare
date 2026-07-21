import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import {
  CONTRACT_REGISTRY_ADDRESS,
  XRP_USD_FEED_ID,
  contractRegistryAbi,
  ftsoV2Abi,
} from "./contracts";
import { coston2 } from "./wagmi";

/**
 * Live XRP/USD reference price from Flare's enshrined FTSO (block-latency
 * feed, updates roughly every block). Display-only - the contracts never
 * read this, it's just a reference for sellers/bidders picking a price.
 */
export function useXrpUsdPrice() {
  const { data: ftsoV2Address } = useReadContract({
    address: CONTRACT_REGISTRY_ADDRESS,
    abi: contractRegistryAbi,
    functionName: "getContractAddressByName",
    args: ["FtsoV2"],
    chainId: coston2.id,
  });

  const { data, isLoading } = useReadContract({
    address: ftsoV2Address,
    abi: ftsoV2Abi,
    functionName: "getFeedByIdInWei",
    args: [XRP_USD_FEED_ID],
    chainId: coston2.id,
    query: { enabled: Boolean(ftsoV2Address), refetchInterval: 5_000 },
  });

  const [valueWei, timestamp] = (data as readonly [bigint, bigint] | undefined) ?? [];

  return {
    price: valueWei !== undefined ? Number(formatUnits(valueWei, 18)) : undefined,
    updatedAt: timestamp !== undefined ? new Date(Number(timestamp) * 1000) : undefined,
    isLoading,
  };
}
