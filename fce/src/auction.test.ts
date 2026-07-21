import { test } from "node:test";
import assert from "node:assert/strict";
import sodium from "libsodium-wrappers";
import { encodePacked, keccak256, type Address, type Hex } from "viem";
import { decideAuctionOutcome } from "./auction.js";
import type { RawBid, SettleAuctionRequest } from "./types.js";

await sodium.ready;

const keyPair = sodium.crypto_box_keypair();

function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Buffer.from(bytes).toString("hex")}` as Hex;
}

function addr(n: number): Address {
  return `0x${n.toString(16).padStart(40, "0")}` as Address;
}

/** Mirrors frontend/lib/bidEncryption.ts exactly. */
function encryptValue(boundTo: Address, priceWei: bigint) {
  const nonceBytes = sodium.randombytes_buf(32);
  const nonce = bytesToHex(nonceBytes);
  const commitmentHash = keccak256(encodePacked(["address", "uint256", "bytes32"], [boundTo, priceWei, nonce]));
  const plaintext = sodium.from_string(JSON.stringify({ priceWei: priceWei.toString(), nonce }));
  const encryptedBid = bytesToHex(sodium.crypto_box_seal(plaintext, keyPair.publicKey));
  return { commitmentHash, encryptedBid };
}

function makeBid(bidder: Address, priceWei: bigint, blockNumber: bigint, logIndex: number): RawBid {
  const { commitmentHash, encryptedBid } = encryptValue(bidder, priceWei);
  return { bidder, commitmentHash, encryptedBid, blockNumber, logIndex };
}

const baseRequest: Omit<SettleAuctionRequest, "bids"> = {
  auctionAddress: addr(0xaa),
  bidDeposit: 10_000_000_000_000_000_000n, // 10 ether
  hasPublicMinPrice: false,
  publicMinPrice: 0n,
};

test("zero bids -> NO_WINNER", () => {
  const result = decideAuctionOutcome({ ...baseRequest, bids: [] }, keyPair);
  assert.deepEqual(result, { outcome: "NO_WINNER" });
});

test("one valid bid -> that bidder wins at their price", () => {
  const bidder = addr(1);
  const bids = [makeBid(bidder, 3n * 10n ** 18n, 100n, 0)];
  const result = decideAuctionOutcome({ ...baseRequest, bids }, keyPair);
  assert.equal(result.outcome, "WINNER");
  if (result.outcome === "WINNER") {
    assert.equal(result.winner.toLowerCase(), bidder.toLowerCase());
    assert.equal(result.winningPrice, 3n * 10n ** 18n);
  }
});

test("highest of several distinct bids wins", () => {
  const bids = [
    makeBid(addr(1), 2n * 10n ** 18n, 100n, 0),
    makeBid(addr(2), 5n * 10n ** 18n, 101n, 0),
    makeBid(addr(3), 4n * 10n ** 18n, 102n, 0),
  ];
  const result = decideAuctionOutcome({ ...baseRequest, bids }, keyPair);
  assert.equal(result.outcome, "WINNER");
  if (result.outcome === "WINNER") {
    assert.equal(result.winner.toLowerCase(), addr(2).toLowerCase());
    assert.equal(result.winningPrice, 5n * 10n ** 18n);
  }
});

test("tie: equal highest price -> earliest commitment wins (lowest blockNumber)", () => {
  const bids = [
    makeBid(addr(1), 5n * 10n ** 18n, 105n, 2), // later block
    makeBid(addr(2), 5n * 10n ** 18n, 100n, 0), // earliest
    makeBid(addr(3), 5n * 10n ** 18n, 100n, 1), // same block, later logIndex
  ];
  const result = decideAuctionOutcome({ ...baseRequest, bids }, keyPair);
  assert.equal(result.outcome, "WINNER");
  if (result.outcome === "WINNER") {
    assert.equal(result.winner.toLowerCase(), addr(2).toLowerCase());
  }
});

test("tie within the same block: lowest logIndex wins", () => {
  const bids = [
    makeBid(addr(1), 5n * 10n ** 18n, 100n, 3),
    makeBid(addr(2), 5n * 10n ** 18n, 100n, 1),
  ];
  const result = decideAuctionOutcome({ ...baseRequest, bids }, keyPair);
  assert.equal(result.outcome, "WINNER");
  if (result.outcome === "WINNER") {
    assert.equal(result.winner.toLowerCase(), addr(2).toLowerCase());
  }
});

test("bid exceeding bidDeposit is excluded -> NO_WINNER if it's the only bid", () => {
  const bids = [makeBid(addr(1), 20n * 10n ** 18n, 100n, 0)]; // > 10 ether deposit
  const result = decideAuctionOutcome({ ...baseRequest, bids }, keyPair);
  assert.deepEqual(result, { outcome: "NO_WINNER" });
});

test("bid exceeding bidDeposit is excluded even when a valid lower bid exists", () => {
  const bids = [
    makeBid(addr(1), 20n * 10n ** 18n, 100n, 0), // excluded: exceeds deposit
    makeBid(addr(2), 3n * 10n ** 18n, 101n, 0),
  ];
  const result = decideAuctionOutcome({ ...baseRequest, bids }, keyPair);
  assert.equal(result.outcome, "WINNER");
  if (result.outcome === "WINNER") {
    assert.equal(result.winner.toLowerCase(), addr(2).toLowerCase());
  }
});

test("bid below public reserve is excluded", () => {
  const bids = [makeBid(addr(1), 2n * 10n ** 18n, 100n, 0)];
  const request: SettleAuctionRequest = {
    ...baseRequest,
    hasPublicMinPrice: true,
    publicMinPrice: 3n * 10n ** 18n,
    bids,
  };
  const result = decideAuctionOutcome(request, keyPair);
  assert.deepEqual(result, { outcome: "NO_WINNER" });
});

test("bid at or above public reserve wins", () => {
  const bids = [makeBid(addr(1), 3n * 10n ** 18n, 100n, 0)];
  const request: SettleAuctionRequest = {
    ...baseRequest,
    hasPublicMinPrice: true,
    publicMinPrice: 3n * 10n ** 18n,
    bids,
  };
  const result = decideAuctionOutcome(request, keyPair);
  assert.equal(result.outcome, "WINNER");
});

test("bid below hidden (encrypted) reserve is excluded", () => {
  const bids = [makeBid(addr(1), 2n * 10n ** 18n, 100n, 0)];
  const { encryptedBid: encryptedMinPriceBlob } = encryptValue(baseRequest.auctionAddress, 3n * 10n ** 18n);
  const request: SettleAuctionRequest = { ...baseRequest, encryptedMinPriceBlob, bids };
  const result = decideAuctionOutcome(request, keyPair);
  assert.deepEqual(result, { outcome: "NO_WINNER" });
});

test("bid at or above hidden reserve wins, reserve itself never appears in the outcome", () => {
  const bids = [makeBid(addr(1), 4n * 10n ** 18n, 100n, 0)];
  const { encryptedBid: encryptedMinPriceBlob } = encryptValue(baseRequest.auctionAddress, 3n * 10n ** 18n);
  const request: SettleAuctionRequest = { ...baseRequest, encryptedMinPriceBlob, bids };
  const result = decideAuctionOutcome(request, keyPair);
  assert.equal(result.outcome, "WINNER");
  if (result.outcome === "WINNER") {
    assert.equal(result.winningPrice, 4n * 10n ** 18n);
  }
});

test("undecryptable bid (corrupt ciphertext) is discarded, not thrown", () => {
  const good = makeBid(addr(1), 3n * 10n ** 18n, 100n, 0);
  const corrupt: RawBid = {
    bidder: addr(2),
    commitmentHash: keccak256("0xdeadbeef"),
    encryptedBid: "0x0000" as Hex,
    blockNumber: 101n,
    logIndex: 0,
  };
  const result = decideAuctionOutcome({ ...baseRequest, bids: [good, corrupt] }, keyPair);
  assert.equal(result.outcome, "WINNER");
  if (result.outcome === "WINNER") {
    assert.equal(result.winner.toLowerCase(), addr(1).toLowerCase());
  }
});

test("commitment hash mismatch (tampered on-chain hash) is discarded", () => {
  const { encryptedBid } = encryptValue(addr(1), 3n * 10n ** 18n);
  const tampered: RawBid = {
    bidder: addr(1),
    commitmentHash: keccak256("0x1234"), // does not match the real (bidder, price, nonce)
    encryptedBid,
    blockNumber: 100n,
    logIndex: 0,
  };
  const result = decideAuctionOutcome({ ...baseRequest, bids: [tampered] }, keyPair);
  assert.deepEqual(result, { outcome: "NO_WINNER" });
});
