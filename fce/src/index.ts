import express from "express";
import sodium from "libsodium-wrappers";
import { isAddress, type Address, type Hex } from "viem";
import { loadOrCreateIdentity } from "./identity.js";
import { decideAuctionOutcome } from "./auction.js";
import { signWinnerResult, signNoWinnerResult } from "./signing.js";
import type { RawBid, SettleAuctionRequest } from "./types.js";

const PORT = Number(process.env.PORT ?? 8787);

async function main() {
  const identity = await loadOrCreateIdentity();
  await sodium.ready;

  console.log("=".repeat(72));
  console.log(`SealedFlare FCE module - mode: ${identity.mode}`);
  console.log(`TEE signing address:      ${identity.signingAccount.address}`);
  console.log(`TEE encryption public key: ${sodium.to_base64(identity.encryptionPublicKey)}`);
  console.log(`Code hash (simulated):     ${identity.codeHash}`);
  console.log(`Identity created at:       ${identity.createdAt}`);
  console.log("=".repeat(72));
  console.log(
    "Register this signing address with AuctionFactory.registerTeeSigner(...) " +
      "before any auction created against it can be settled.",
  );

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // The browser (frontend/lib/bidEncryption.ts callers) fetches /identity and
  // posts to /action directly from a different origin (e.g. localhost:3001
  // vs this server's localhost:8787) - without CORS headers the browser
  // blocks the response entirely and every call fails as "Failed to fetch".
  // This module holds no secrets reachable via these two read-only/stateless
  // endpoints, so a permissive origin is fine for local/demo use.
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });
  // Express 5 (path-to-regexp v8) requires a named wildcard, not bare "*".
  app.options("/*splat", (_req, res) => res.sendStatus(204));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Mirrors the real FCC "identity" concept: what a frontend needs to encrypt
  // a bid to this module and what a contract owner needs to register it as a
  // trusted signer.
  app.get("/identity", (_req, res) => {
    res.json({
      mode: identity.mode,
      signingAddress: identity.signingAccount.address,
      encryptionPublicKey: sodium.to_base64(identity.encryptionPublicKey),
      codeHash: identity.codeHash,
      createdAt: identity.createdAt,
    });
  });

  // Named /action and shaped as { opType, opCommand, message } as a deliberate
  // nod to the real FCC action-handler interface (POST /action, OPType/
  // OPCommand routing, decode -> validate -> execute -> build-result) even
  // though SIMULATION mode talks directly over HTTP instead of through the
  // real TeeExtensionRegistry / ext-proxy stack - see README.md.
  app.post("/action", async (req, res) => {
    try {
      const { opType, opCommand, message } = req.body ?? {};

      if (opType !== "AUCTION") {
        return res.status(400).json({ status: 0, error: `unsupported opType: ${opType}` });
      }
      if (opCommand !== "SETTLE") {
        return res.status(400).json({ status: 0, error: `unsupported opCommand: ${opCommand}` });
      }

      const settleRequest = decodeSettleRequest(message);

      const keyPair = { publicKey: identity.encryptionPublicKey, privateKey: identity.encryptionPrivateKey };
      const decision = decideAuctionOutcome(settleRequest, keyPair);

      if (decision.outcome === "NO_WINNER") {
        const signature = await signNoWinnerResult(identity.signingAccount, settleRequest.auctionAddress);
        return res.json({
          status: 1,
          opType,
          opCommand,
          data: { outcome: "NO_WINNER" },
          signature,
          signerAddress: identity.signingAccount.address,
        });
      }

      const signature = await signWinnerResult(
        identity.signingAccount,
        settleRequest.auctionAddress,
        decision.winner,
        decision.winningPrice,
      );
      return res.json({
        status: 1,
        opType,
        opCommand,
        data: { outcome: "WINNER", winner: decision.winner, winningPrice: decision.winningPrice.toString() },
        signature,
        signerAddress: identity.signingAccount.address,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      return res.status(400).json({ status: 0, error: message });
    }
  });

  app.listen(PORT, () => {
    console.log(`FCE module listening on :${PORT}`);
  });
}

function decodeSettleRequest(message: unknown): SettleAuctionRequest {
  if (typeof message !== "object" || message === null) {
    throw new Error("message must be an object");
  }
  const m = message as Record<string, unknown>;

  if (typeof m.auctionAddress !== "string" || !isAddress(m.auctionAddress)) {
    throw new Error("message.auctionAddress must be a valid address");
  }
  if (typeof m.bidDeposit !== "string") throw new Error("message.bidDeposit must be a decimal string");
  if (typeof m.hasPublicMinPrice !== "boolean") throw new Error("message.hasPublicMinPrice must be a boolean");
  if (typeof m.publicMinPrice !== "string") throw new Error("message.publicMinPrice must be a decimal string");
  if (!Array.isArray(m.bids)) throw new Error("message.bids must be an array");

  const bids: RawBid[] = m.bids.map((raw, i) => {
    const b = raw as Record<string, unknown>;
    if (typeof b.bidder !== "string" || !isAddress(b.bidder)) throw new Error(`bids[${i}].bidder invalid`);
    if (typeof b.commitmentHash !== "string") throw new Error(`bids[${i}].commitmentHash invalid`);
    if (typeof b.encryptedBid !== "string") throw new Error(`bids[${i}].encryptedBid invalid`);
    if (typeof b.blockNumber !== "string") throw new Error(`bids[${i}].blockNumber invalid`);
    if (typeof b.logIndex !== "number") throw new Error(`bids[${i}].logIndex invalid`);
    return {
      bidder: b.bidder as Address,
      commitmentHash: b.commitmentHash as Hex,
      encryptedBid: b.encryptedBid as Hex,
      blockNumber: BigInt(b.blockNumber),
      logIndex: b.logIndex,
    };
  });

  return {
    auctionAddress: m.auctionAddress as Address,
    bidDeposit: BigInt(m.bidDeposit),
    hasPublicMinPrice: m.hasPublicMinPrice,
    publicMinPrice: BigInt(m.publicMinPrice),
    encryptedMinPriceBlob: typeof m.encryptedMinPriceBlob === "string" ? (m.encryptedMinPriceBlob as Hex) : undefined,
    bids,
  };
}

main().catch((err) => {
  console.error("FCE module failed to start:", err);
  process.exit(1);
});
