/**
 * Settlement relayer: reads a closed auction's committed bids from chain,
 * asks the FCE module (running locally, e.g. via `docker compose up`) to
 * decrypt/decide/sign a result, then submits settle()/settleNoWinner().
 *
 * This is the "spięcie" (glue) between the on-chain auction and the FCE
 * module - it never sees plaintext bids itself, it only ferries ciphertext
 * in and a signed result out. Anyone can run this (it doesn't need to be the
 * TEE operator); the contract only trusts the signature, not the caller.
 *
 * Usage:
 *   COSTON2_RPC_URL=... SETTLER_PRIVATE_KEY=0x... FCE_URL=http://localhost:8787 \
 *     npm run settle -- 0xAuctionAddress
 */
import { createPublicClient, createWalletClient, http, parseAbiItem, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem";
import sealedBidAuctionAbi from "./abi/SealedBidAuction.json" with { type: "json" };

const coston2 = defineChain({
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: { default: { http: [process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc"] } },
});

const bidCommittedEvent = parseAbiItem(
  "event BidCommitted(address indexed bidder, bytes32 commitmentHash, bytes encryptedBid, uint256 deposit)",
);
const minPriceCommittedEvent = parseAbiItem("event MinPriceCommitted(address indexed auction, bytes encryptedMinPriceBlob)");

// Flare's public Coston2 RPC caps eth_getLogs to a 30-block range per call
// (unlike a local anvil node, which has no such limit) - fetch in chunks.
// Typed loosely (any) deliberately: this is a small operator script, not a
// library, and fighting viem's generic Log<> inference through a wrapper
// isn't worth it - callers know the concrete shape they asked for.
const MAX_BLOCK_RANGE = 29n; // toBlock - fromBlock must be < 30 on Flare's public RPC

async function getLogsChunked(
  client: ReturnType<typeof createPublicClient>,
  params: { address: Address; event: ReturnType<typeof parseAbiItem>; args?: Record<string, unknown>; fromBlock: bigint; toBlock: bigint },
): Promise<any[]> {
  const { fromBlock, toBlock, ...rest } = params;
  const allLogs: any[] = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_BLOCK_RANGE + 1n) {
    const end = start + MAX_BLOCK_RANGE < toBlock ? start + MAX_BLOCK_RANGE : toBlock;
    const chunk = await client.getLogs({ ...rest, fromBlock: start, toBlock: end } as never);
    allLogs.push(...chunk);
  }
  return allLogs;
}

async function main() {
  const auctionAddress = process.argv[2] as Address | undefined;
  if (!auctionAddress) {
    console.error("Usage: npm run settle -- <auctionAddress>");
    process.exit(1);
  }

  const fceUrl = process.env.FCE_URL ?? "http://localhost:8787";
  const rpcUrl = process.env.COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc";
  const settlerKey = process.env.SETTLER_PRIVATE_KEY as Hex | undefined;
  if (!settlerKey) throw new Error("SETTLER_PRIVATE_KEY env var is required (any funded Coston2 key - gas payer only)");

  const publicClient = createPublicClient({ chain: coston2, transport: http(rpcUrl) });
  const settlerAccount = privateKeyToAccount(settlerKey);
  const walletClient = createWalletClient({ account: settlerAccount, chain: coston2, transport: http(rpcUrl) });

  console.log(`Auction:  ${auctionAddress}`);
  console.log(`Settler:  ${settlerAccount.address} (pays gas only, does not need to be the TEE key)`);

  const [biddingDeadline, factory, bidDeposit, hasPublicMinPrice, publicMinPrice, state] = await Promise.all([
    publicClient.readContract({ address: auctionAddress, abi: sealedBidAuctionAbi as any, functionName: "biddingDeadline" }) as Promise<bigint>,
    publicClient.readContract({ address: auctionAddress, abi: sealedBidAuctionAbi as any, functionName: "factory" }) as Promise<Address>,
    publicClient.readContract({ address: auctionAddress, abi: sealedBidAuctionAbi as any, functionName: "bidDeposit" }) as Promise<bigint>,
    publicClient.readContract({ address: auctionAddress, abi: sealedBidAuctionAbi as any, functionName: "hasPublicMinPrice" }) as Promise<boolean>,
    publicClient.readContract({ address: auctionAddress, abi: sealedBidAuctionAbi as any, functionName: "publicMinPrice" }) as Promise<bigint>,
    publicClient.readContract({ address: auctionAddress, abi: sealedBidAuctionAbi as any, functionName: "state" }) as Promise<number>,
  ]);

  if (state !== 1) {
    throw new Error(`Auction state is ${state} (expected 1 = Open). Already settled, or never funded.`);
  }

  const latestBlock = await publicClient.getBlockNumber();
  const latestBlockData = await publicClient.getBlock({ blockNumber: latestBlock });
  if (latestBlockData.timestamp < biddingDeadline) {
    throw new Error(`Bidding still open until ${new Date(Number(biddingDeadline) * 1000).toISOString()}`);
  }

  // FROM_BLOCK lets the operator pin the search to the auction's actual
  // creation block (from its createAuction tx receipt) for a fast, cheap
  // search; otherwise default to a ~4-day lookback window (~1.8s blocks).
  const defaultLookback = 200_000n;
  const fromBlock = process.env.FROM_BLOCK
    ? BigInt(process.env.FROM_BLOCK)
    : latestBlock > defaultLookback
      ? latestBlock - defaultLookback
      : 0n;

  console.log(`Fetching BidCommitted logs from block ${fromBlock}...`);
  const bidLogs = await getLogsChunked(publicClient, {
    address: auctionAddress,
    event: bidCommittedEvent,
    fromBlock,
    toBlock: latestBlock,
  });
  console.log(`Found ${bidLogs.length} bid(s).`);

  let encryptedMinPriceBlob: Hex | undefined;
  if (!hasPublicMinPrice) {
    const minPriceLogs = await getLogsChunked(publicClient, {
      address: factory,
      event: minPriceCommittedEvent,
      args: { auction: auctionAddress },
      fromBlock,
      toBlock: latestBlock,
    });
    if (minPriceLogs.length > 0) {
      encryptedMinPriceBlob = minPriceLogs[0].args.encryptedMinPriceBlob;
    }
  }

  const body = {
    opType: "AUCTION",
    opCommand: "SETTLE",
    message: {
      auctionAddress,
      bidDeposit: bidDeposit.toString(),
      hasPublicMinPrice,
      publicMinPrice: publicMinPrice.toString(),
      encryptedMinPriceBlob,
      bids: bidLogs.map((log) => ({
        bidder: log.args.bidder,
        commitmentHash: log.args.commitmentHash,
        encryptedBid: log.args.encryptedBid,
        blockNumber: log.blockNumber!.toString(),
        logIndex: log.logIndex!,
      })),
    },
  };

  console.log(`Asking FCE module (${fceUrl}) to decide...`);
  const fceRes = await fetch(`${fceUrl}/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const fceResult = (await fceRes.json()) as {
    status: number;
    error?: string;
    data?: { outcome: "WINNER" | "NO_WINNER"; winner?: Address; winningPrice?: string };
    signature?: Hex;
  };

  if (fceResult.status !== 1 || !fceResult.data) {
    throw new Error(`FCE module error: ${fceResult.error ?? "unknown"}`);
  }

  console.log("FCE decision:", fceResult.data);

  let txHash: Hex;
  if (fceResult.data.outcome === "NO_WINNER") {
    txHash = await walletClient.writeContract({
      address: auctionAddress,
      abi: sealedBidAuctionAbi as any,
      functionName: "settleNoWinner",
      args: [fceResult.signature],
    });
  } else {
    txHash = await walletClient.writeContract({
      address: auctionAddress,
      abi: sealedBidAuctionAbi as any,
      functionName: "settle",
      args: [fceResult.data.winner, BigInt(fceResult.data.winningPrice!), fceResult.signature],
    });
  }

  console.log(`Submitted settlement tx: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`Confirmed in block ${receipt.blockNumber}, status: ${receipt.status}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
