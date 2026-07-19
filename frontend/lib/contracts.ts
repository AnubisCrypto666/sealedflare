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

export const FCE_URL = process.env.NEXT_PUBLIC_FCE_URL ?? "http://localhost:8787";

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
