import type { Address } from "viem";
import auctionFactoryAbi from "./abi/AuctionFactory.json";
import sealedBidAuctionAbi from "./abi/SealedBidAuction.json";

export const AUCTION_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_AUCTION_FACTORY_ADDRESS ??
  "0x58158479582bc0BA6bEa5822eaAE01a8Bd6E47A1") as Address;

// Real FXRP FAsset on Coston2, resolved via the Flare Contracts Registry
// (registry -> AssetManagerFXRP -> fAsset()). Symbol "FXRP", name "FTestXRP".
export const FXRP_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_FXRP_TOKEN_ADDRESS ??
  "0x0b6A3645c240605887a5532109323A3E12273dc7") as Address;

// FXRP uses 6 decimals (like real XRP), NOT 18 - never use parseEther/formatEther
// on FXRP amounts. bidDeposit and the native C2FLR side of the auction (winning
// price, deposits) ARE 18-decimal native currency - only the FXRP lot amount
// uses this.
export const FXRP_DECIMALS = 6;

// The FCE module's sealed-box encryption public key - safe to hardcode: it's
// explicitly meant to be public (anyone can encrypt to it; only the paired
// private key inside the FCE module can decrypt), and the deployed
// AuctionFactory above is already permanently tied to this exact identity's
// signing address as its trusted TEE signer. Hardcoding it means bid
// encryption works from any deployment of this frontend (e.g. Vercel)
// without the browser needing to reach the FCE module at all - only the
// settlement relayer (fce/src/settle-auction.ts, run server-side) talks to
// the FCE module directly. Override via NEXT_PUBLIC_FCE_ENCRYPTION_PUBLIC_KEY
// only if you've registered a different signer with your own factory
// (see README "Running it yourself").
export const FCE_ENCRYPTION_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_FCE_ENCRYPTION_PUBLIC_KEY ?? "S-UtgOJoOyzl6A5gvKqZm-Lah6tIemB1o_kjU7SRU1E";

// Same address on every Flare network (Coston2, Songbird, Flare, Coston) -
// never hardcode FtsoV2's own address, always resolve it through here.
export const CONTRACT_REGISTRY_ADDRESS: Address = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

export const contractRegistryAbi = [
  {
    type: "function",
    name: "getContractAddressByName",
    stateMutability: "view",
    inputs: [{ name: "_name", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

// TestFtsoV2Interface on Coston2 - all view, no fees (mainnet's FtsoV2Interface
// has the same getFeedByIdInWei signature but some other methods are payable).
export const ftsoV2Abi = [
  {
    type: "function",
    name: "getFeedByIdInWei",
    stateMutability: "view",
    inputs: [{ name: "_feedId", type: "bytes21" }],
    outputs: [
      { name: "_value", type: "uint256" },
      { name: "_timestamp", type: "uint64" },
    ],
  },
] as const;

// bytes21 feed ID: 0x01 (crypto category) + "XRP/USD" UTF-8, zero-padded to 21 bytes.
export const XRP_USD_FEED_ID = "0x015852502f55534400000000000000000000000000" as const;

// Minimal ERC20 fragment for FXRP allowance/approve/balance checks.
export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export { auctionFactoryAbi, sealedBidAuctionAbi };
