import type { Address, Hex } from "viem";

/** One sealed bid as read off-chain from a BidCommitted event log. */
export interface RawBid {
  bidder: Address;
  commitmentHash: Hex;
  encryptedBid: Hex;
  blockNumber: bigint;
  logIndex: number;
}

/** A bid after successful decryption + commitment verification. */
export interface DecryptedBid {
  bidder: Address;
  priceWei: bigint;
  blockNumber: bigint;
  logIndex: number;
}

/** Everything the FCE module needs to decide + sign one auction's outcome. */
export interface SettleAuctionRequest {
  auctionAddress: Address;
  bidDeposit: bigint;
  hasPublicMinPrice: boolean;
  publicMinPrice: bigint;
  /** Sealed-box ciphertext of the hidden reserve price, if the seller set one. */
  encryptedMinPriceBlob?: Hex;
  bids: RawBid[];
}

export type SettleOutcome =
  | { outcome: "WINNER"; winner: Address; winningPrice: bigint }
  | { outcome: "NO_WINNER" };

export interface SignedSettleResult {
  outcome: SettleOutcome;
  signature: Hex;
  signerAddress: Address;
}
