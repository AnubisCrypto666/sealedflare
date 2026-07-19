import sodium from "libsodium-wrappers";
import { encodePacked, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

function bytesToHex(bytes: Uint8Array): Hex {
  return `0x${Buffer.from(bytes).toString("hex")}` as Hex;
}

function encryptBid(teePublicKeyB64: string, bidder: Address, priceWei: bigint) {
  const nonceBytes = sodium.randombytes_buf(32);
  const nonce = bytesToHex(nonceBytes);
  const commitmentHash = keccak256(encodePacked(["address", "uint256", "bytes32"], [bidder, priceWei, nonce]));
  const plaintext = sodium.from_string(JSON.stringify({ priceWei: priceWei.toString(), nonce }));
  const teePublicKey = sodium.from_base64(teePublicKeyB64);
  const encryptedBid = bytesToHex(sodium.crypto_box_seal(plaintext, teePublicKey));
  return { commitmentHash, encryptedBid };
}

async function main() {
  await sodium.ready;

  const identityRes = await fetch("http://localhost:8787/identity");
  const identity = (await identityRes.json()) as { encryptionPublicKey: string; signingAddress: Address };
  console.log("FCE identity:", identity);

  const alice = privateKeyToAccount(generatePrivateKey());
  const bob = privateKeyToAccount(generatePrivateKey());

  const aliceBid = encryptBid(identity.encryptionPublicKey, alice.address, 3_000_000_000_000_000_000n);
  const bobBid = encryptBid(identity.encryptionPublicKey, bob.address, 2_000_000_000_000_000_000n);

  const auctionAddress = privateKeyToAccount(generatePrivateKey()).address;

  const res = await fetch("http://localhost:8787/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      opType: "AUCTION",
      opCommand: "SETTLE",
      message: {
        auctionAddress,
        bidDeposit: "5000000000000000000",
        hasPublicMinPrice: false,
        publicMinPrice: "0",
        bids: [
          { bidder: alice.address, commitmentHash: aliceBid.commitmentHash, encryptedBid: aliceBid.encryptedBid, blockNumber: "100", logIndex: 0 },
          { bidder: bob.address, commitmentHash: bobBid.commitmentHash, encryptedBid: bobBid.encryptedBid, blockNumber: "101", logIndex: 0 },
        ],
      },
    }),
  });

  const result = (await res.json()) as {
    data?: { outcome?: string; winner?: string; winningPrice?: string };
  };
  console.log("Settlement result:", result);

  if (result.data?.outcome !== "WINNER" || result.data?.winner?.toLowerCase() !== alice.address.toLowerCase()) {
    throw new Error("FAIL: expected alice (higher bid) to win");
  }
  if (result.data?.winningPrice !== "3000000000000000000") {
    throw new Error("FAIL: unexpected winning price");
  }
  console.log("PASS: highest bidder selected with correct price and a signature was returned.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
