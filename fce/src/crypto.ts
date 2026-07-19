import sodium from "libsodium-wrappers";
import { encodePacked, keccak256, type Address, type Hex } from "viem";

export interface DecryptedBidPayload {
  priceWei: bigint;
  nonce: Hex;
}

/**
 * Decrypts a libsodium sealed-box ciphertext (crypto_box_seal) produced by
 * the browser against this module's encryption public key. Returns null on
 * any failure (wrong key, corrupt ciphertext, bad JSON shape) - callers must
 * treat that as "discard this bid", never throw and abort the whole batch.
 */
export function decryptSealedBid(
  encryptedBid: Hex,
  keyPair: { publicKey: Uint8Array; privateKey: Uint8Array },
): DecryptedBidPayload | null {
  try {
    const ciphertext = hexToBytes(encryptedBid);
    const plaintext = sodium.crypto_box_seal_open(ciphertext, keyPair.publicKey, keyPair.privateKey);
    const parsed = JSON.parse(sodium.to_string(plaintext)) as { priceWei?: string; nonce?: string };
    if (typeof parsed.priceWei !== "string" || typeof parsed.nonce !== "string") return null;
    if (!/^0x[0-9a-fA-F]{64}$/.test(parsed.nonce)) return null;
    return { priceWei: BigInt(parsed.priceWei), nonce: parsed.nonce as Hex };
  } catch {
    return null;
  }
}

/**
 * Same commitment scheme the browser uses in frontend/lib/bidEncryption.ts:
 * keccak256(abi.encodePacked(bidder, priceWei, nonce)). Verifying this
 * against the on-chain commitmentHash proves the decrypted price/nonce is
 * exactly what the bidder committed to, not something substituted later.
 */
export function computeCommitmentHash(bidder: Address, priceWei: bigint, nonce: Hex): Hex {
  return keccak256(encodePacked(["address", "uint256", "bytes32"], [bidder, priceWei, nonce]));
}

function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
