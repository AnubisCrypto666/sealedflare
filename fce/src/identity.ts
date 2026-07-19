import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import sodium from "libsodium-wrappers";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { Hex } from "viem";

export type FceMode = "SIMULATION" | "FCC";

export interface Identity {
  mode: FceMode;
  signingAccount: PrivateKeyAccount;
  encryptionPublicKey: Uint8Array;
  encryptionPrivateKey: Uint8Array;
  /**
   * Stand-in for the real Confidential Space attestation code hash. In
   * SIMULATION mode this is just a hash of this module's own source, so it
   * changes whenever the FCE code changes - it carries no security
   * guarantee. A real FCC deployment reports a hardware-measured code hash
   * instead (see fce/README.md, "Path to production FCC").
   */
  codeHash: Hex;
  createdAt: string;
}

interface PersistedIdentity {
  signingPrivateKey: Hex;
  encryptionPublicKey: string; // base64
  encryptionPrivateKey: string; // base64
  createdAt: string;
}

function computeSimulatedCodeHash(): Hex {
  // A real TEE reports a hardware-measured hash of the running image. Here we
  // just hash this file's own source as an honest placeholder - see the
  // module docstring above and fce/README.md.
  const hash = createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");
  return `0x${hash}`;
}

/**
 * Loads a persisted identity (dev convenience, so you don't have to
 * re-register the signer with the AuctionFactory on every restart) or
 * generates a fresh one. Real TEEs generate a fresh identity every boot and
 * must be re-attested - set FCE_PERSIST_KEY=false to match that behavior.
 */
export async function loadOrCreateIdentity(): Promise<Identity> {
  await sodium.ready;

  const mode = (process.env.FCE_MODE ?? "SIMULATION") as FceMode;
  if (mode === "FCC") {
    throw new Error(
      "FCC mode is not implemented yet - real Flare Compute Extension registration " +
        "(TeeExtensionRegistry / TeeMachineRegistry / Confidential Space) is not " +
        "publicly available yet. See fce/README.md, 'Path to production FCC'.",
    );
  }

  const persist = (process.env.FCE_PERSIST_KEY ?? "true").toLowerCase() === "true";
  const keyPath = process.env.FCE_KEY_PATH ?? new URL("../data/tee-identity.json", import.meta.url).pathname;

  if (persist && existsSync(keyPath)) {
    const persisted: PersistedIdentity = JSON.parse(readFileSync(keyPath, "utf8"));
    return {
      mode,
      signingAccount: privateKeyToAccount(persisted.signingPrivateKey),
      encryptionPublicKey: sodium.from_base64(persisted.encryptionPublicKey),
      encryptionPrivateKey: sodium.from_base64(persisted.encryptionPrivateKey),
      codeHash: computeSimulatedCodeHash(),
      createdAt: persisted.createdAt,
    };
  }

  const signingPrivateKey = generatePrivateKey();
  const signingAccount = privateKeyToAccount(signingPrivateKey);
  const encryptionKeyPair = sodium.crypto_box_keypair();
  const createdAt = new Date().toISOString();

  if (persist) {
    const persisted: PersistedIdentity = {
      signingPrivateKey,
      encryptionPublicKey: sodium.to_base64(encryptionKeyPair.publicKey),
      encryptionPrivateKey: sodium.to_base64(encryptionKeyPair.privateKey),
      createdAt,
    };
    mkdirSync(dirname(keyPath), { recursive: true });
    writeFileSync(keyPath, JSON.stringify(persisted, null, 2));
  }

  return {
    mode,
    signingAccount,
    encryptionPublicKey: encryptionKeyPair.publicKey,
    encryptionPrivateKey: encryptionKeyPair.privateKey,
    codeHash: computeSimulatedCodeHash(),
    createdAt,
  };
}
