# SealedFlare FCE module

The off-chain half of SealedFlare's confidential compute: decrypts sealed bids,
picks a winner (or decides there is none), and signs the result with a TEE
identity key that `AuctionFactory` has registered as trusted. `SealedBidAuction`
never decrypts or evaluates bids itself - it only verifies a signature against
the registered signer address.

## Two modes, one interface

```
FCE_MODE=SIMULATION   # today: runs locally, key generated/loaded on boot
FCE_MODE=FCC          # future: real TEE, see "Path to production" below
```

Both modes expose the exact same HTTP interface (`GET /identity`, `POST
/action`). Nothing on the contract side or in the rest of the app needs to
change when `FCC` mode becomes real - see below.

**Why SIMULATION and not the real FCC registry/proxy stack today:** the Flare
team confirmed on Discord (17 July 2026) that external developers should build
against a simulated TEE on Coston2 for this hackathon, since public FCC
registration (`TeeExtensionRegistry`, `TeeMachineRegistry`, a GCP Confidential
Space VM, `ext-proxy`, indexer DB access) isn't available yet. So this module
implements the same *trust model* real FCC extensions use - see
`fce-weather-insurance`'s `settle()`, which also just `ecrecover`s a signed
result and checks it against a registered `teeAddress` - without going through
the actual instruction-routing infrastructure that requires production TEE
access we don't have.

## Interface

### `GET /identity`

Returns what the rest of the app needs:

```json
{
  "mode": "SIMULATION",
  "signingAddress": "0x...",        // register this with AuctionFactory.registerTeeSigner()
  "encryptionPublicKey": "base64",  // frontend encrypts bids to this (libsodium sealed box)
  "codeHash": "0x...",              // SIMULATION: hash of this module's own source; FCC: real attested hash
  "createdAt": "..."
}
```

### `POST /action`

Named `/action` and shaped as `{ opType, opCommand, message }` as a deliberate
nod to the real FCC action-handler interface (`POST /action`, `OPType`/
`OPCommand` routing, the decode -> validate -> execute -> build-result
pattern) even though SIMULATION mode talks directly over HTTP instead of
through `TeeExtensionRegistry` + `ext-proxy`.

Request:

```json
{
  "opType": "AUCTION",
  "opCommand": "SETTLE",
  "message": {
    "auctionAddress": "0x...",
    "bidDeposit": "5000000000000000000",
    "hasPublicMinPrice": false,
    "publicMinPrice": "0",
    "encryptedMinPriceBlob": "0x... (optional, hidden-reserve mode)",
    "bids": [
      { "bidder": "0x...", "commitmentHash": "0x...", "encryptedBid": "0x...", "blockNumber": "123", "logIndex": 0 }
    ]
  }
}
```

Response (winner found):

```json
{
  "status": 1,
  "data": { "outcome": "WINNER", "winner": "0x...", "winningPrice": "3000000000000000000" },
  "signature": "0x...",
  "signerAddress": "0x..."
}
```

or `{ "data": { "outcome": "NO_WINNER" }, ... }` if no bid was valid (none
decrypted successfully, all exceeded `bidDeposit`, or all fell below the
reserve).

## How a bid is decided

For each submitted bid (`src/auction.ts`):

1. Decrypt `encryptedBid` with the module's X25519 private key
   (`crypto_box_seal_open`). Decryption failure -> discard, never throws.
2. Recompute `keccak256(abi.encodePacked(bidder, priceWei, nonce))` and check
   it matches the on-chain `commitmentHash`. This proves the decrypted price
   is exactly what the bidder committed to - not something else. Mismatch ->
   discard.
3. Discard if `priceWei > bidDeposit` (can't exceed the posted collateral) or
   `priceWei < reserve` (public `publicMinPrice`, or a decrypted hidden
   reserve from `encryptedMinPriceBlob` using the identical sealed-box
   scheme).
4. Among what's left, the highest `priceWei` wins (first-price sealed bid -
   the winner pays their own bid). Ties broken by earliest commitment
   (lowest `blockNumber`, then lowest `logIndex`).
5. No valid bids at all -> `NO_WINNER`.

## Signing scheme (must match `SealedBidAuction.sol` exactly)

```
digest       = keccak256(abi.encodePacked(auctionAddress, "SETTLE", winner, winningPrice))
ethDigest    = toEthSignedMessageHash(digest)   // EIP-191 personal-sign prefix
signature    = sign(ethDigest, teePrivateKey)
```

or for a no-winner result: `keccak256(abi.encodePacked(auctionAddress, "NO_WINNER"))`.
`src/signing.ts` implements this with viem's `account.signMessage({ message: { raw: digest } })`,
which applies the same EIP-191 prefix the contract's `ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(...))`
expects. This was verified against the actual deployed contract on a local
anvil fork, not just re-derived in TypeScript (see git history / dev notes).

## Running it

```bash
docker compose up -d --build
curl http://localhost:8787/identity
```

Or without Docker, for local development:

```bash
npm install
npm run dev
```

Env vars:

| Var | Default | Meaning |
|---|---|---|
| `FCE_MODE` | `SIMULATION` | `SIMULATION` or `FCC` (FCC is a stub - see below) |
| `FCE_PERSIST_KEY` | `true` | Persist the generated identity to `FCE_KEY_PATH` so restarts don't need a new `registerTeeSigner` call. Set `false` for a fresh identity every boot, matching real TEE behavior. |
| `FCE_KEY_PATH` | `./data/tee-identity.json` (`/data/...` in Docker) | Where the persisted identity lives. Gitignored. |
| `PORT` | `8787` | HTTP port |

## Path to production FCC

When public FCC registration opens (Songbird), swapping SIMULATION for a real
TEE requires **no changes to `SealedBidAuction.sol` or `AuctionFactory.sol`**
- they already only trust "a valid signature from a registered signer
address," which is exactly what a real FCC extension also produces. The
changes are entirely on this side:

1. Build the extension against `fce-extension-scaffold` (Go) or port this
   module's `auction.ts`/`crypto.ts`/`signing.ts` logic into its action
   handler, wired to `OP_TYPE_AUCTION` / `OP_COMMAND_SETTLE`.
2. Deploy a real `InstructionSender` contract and register the extension on
   `TeeExtensionRegistry` (see `dev.flare.network/fcc/overview`).
3. Run the extension inside a GCP Confidential Space VM with `MODE=0` (real
   attestation, not `MODE=1` simulated), whitelist its code hash.
4. Take the real attested TEE address from the proxy's `/info` and call
   `AuctionFactory.registerTeeSigner(realAddress)` - the factory's rotatable
   signer registry (see `AuctionFactory.sol`) was built specifically so this
   is a single owner-only transaction, not a redeploy.
5. Point the settlement relayer (`src/settle-auction.ts`) at the real
   extension's proxy URL instead of this module's `/action`.

Everything upstream of the signature (bid encryption in the browser, the
commitment scheme, the contracts) stays identical.

## Reproducible builds

The Docker build is deterministic for a given machine and Node version - the
same best-effort guarantee the official `fce-sign` example documents for its
Python/TypeScript variants (its Go variant is the only one that's bit-for-bit
reproducible cross-machine). Full attested-build reproducibility isn't a
meaningful goal for SIMULATION mode, since there's no real attestation to
match it against; it becomes load-bearing only once this module runs inside
real Confidential Space (see "Path to production" above).
