import sodium from "libsodium-wrappers";
import { encodePacked, keccak256, type Address, type Hex } from "viem";

export interface EncryptedBid {
  commitmentHash: Hex;
  encryptedBid: Hex;
}

/**
 * Encrypts a bid (or a hidden reserve price) to the FCE module's public
 * encryption key using libsodium sealed boxes (crypto_box_seal) - anonymous,
 * one-way encryption: only the FCE module's private key can open it, and
 * nothing here can be traced back to the sender's identity from the
 * ciphertext alone.
 *
 * `commitmentHash` is what actually lands on-chain in commitBid(); it lets
 * the FCE module (fce/src/crypto.ts, computeCommitmentHash) prove the price
 * it decrypted is exactly what this call committed to, without the price
 * ever being stored in contract storage or calldata in the clear.
 *
 * The same function encrypts a seller's hidden reserve price - just pass the
 * factory/auction address in place of a bidder address for `boundTo`, since
 * the reserve isn't tied to any one bidder.
 */
export async function encryptBid(
  teePublicKeyBase64: string,
  boundTo: Address,
  priceWei: bigint,
): Promise<EncryptedBid> {
  await sodium.ready;

  const nonceBytes = sodium.randombytes_buf(32);
  const nonce = bytesToHex(nonceBytes);

  const commitmentHash = keccak256(encodePacked(["address", "uint256", "bytes32"], [boundTo, priceWei, nonce]));

  const plaintext = sodium.from_string(JSON.stringify({ priceWei: priceWei.toString(), nonce }));
  const teePublicKey = sodium.from_base64(teePublicKeyBase64);
  const encryptedBid = bytesToHex(sodium.crypto_box_seal(plaintext, teePublicKey));

  return { commitmentHash, encryptedBid };
}

function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Buffer.from(bytes).toString("hex")}` as Hex;
}
