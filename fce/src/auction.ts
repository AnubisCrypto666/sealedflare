import { decryptSealedBid, computeCommitmentHash } from "./crypto.js";
import type { DecryptedBid, SettleAuctionRequest, SettleOutcome } from "./types.js";

/**
 * Decrypts and validates every bid, then picks a first-price winner. A bid is
 * discarded (never throws - a bad bid just doesn't compete) if it: fails
 * decryption, fails the commitment-hash integrity check, exceeds the
 * uniform bidDeposit cap, or falls below the reserve price. Ties are broken
 * by earliest commitment (lowest blockNumber, then lowest logIndex).
 */
export function decideAuctionOutcome(request: SettleAuctionRequest, keyPair: { publicKey: Uint8Array; privateKey: Uint8Array }): SettleOutcome {
  const effectiveMinPrice = resolveEffectiveMinPrice(request, keyPair);

  const validBids: DecryptedBid[] = [];
  for (const bid of request.bids) {
    const decrypted = decryptSealedBid(bid.encryptedBid, keyPair);
    if (!decrypted) continue;

    const expectedCommitment = computeCommitmentHash(bid.bidder, decrypted.priceWei, decrypted.nonce);
    if (expectedCommitment.toLowerCase() !== bid.commitmentHash.toLowerCase()) continue;

    if (decrypted.priceWei > request.bidDeposit) continue;
    if (decrypted.priceWei < effectiveMinPrice) continue;

    validBids.push({
      bidder: bid.bidder,
      priceWei: decrypted.priceWei,
      blockNumber: bid.blockNumber,
      logIndex: bid.logIndex,
    });
  }

  if (validBids.length === 0) {
    return { outcome: "NO_WINNER" };
  }

  const winner = validBids.reduce((best, candidate) => {
    if (candidate.priceWei > best.priceWei) return candidate;
    if (candidate.priceWei < best.priceWei) return best;
    if (candidate.blockNumber < best.blockNumber) return candidate;
    if (candidate.blockNumber > best.blockNumber) return best;
    return candidate.logIndex < best.logIndex ? candidate : best;
  });

  return { outcome: "WINNER", winner: winner.bidder, winningPrice: winner.priceWei };
}

function resolveEffectiveMinPrice(
  request: SettleAuctionRequest,
  keyPair: { publicKey: Uint8Array; privateKey: Uint8Array },
): bigint {
  if (request.hasPublicMinPrice) return request.publicMinPrice;
  if (!request.encryptedMinPriceBlob) return 0n;

  const decrypted = decryptSealedBid(request.encryptedMinPriceBlob, keyPair);
  return decrypted?.priceWei ?? 0n;
}
