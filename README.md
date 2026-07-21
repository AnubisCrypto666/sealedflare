# SealedFlare

Sealed-bid OTC auctions for FXRP on Flare Coston2, built for the **Flare Summer
Signal** hackathon (Confidential Compute Apps track).

## The problem

A large FXRP sell order on a fully transparent chain is visible before it
executes — the market front-runs it, the price moves against the seller
before the trade completes, and institutions holding large positions simply
won't trade this way. This is exactly the class of problem Flare's
Confidential Compute direction exists to solve.

## The solution

1. A seller creates an auction: FXRP is escrowed in a contract, with a bidding
   window and (optionally hidden) reserve price.
2. Buyers submit bids encrypted, in the browser, to a confidential compute
   module's public key. Only a commitment hash and the ciphertext ever land
   on-chain (in an event, not storage) - nobody, including this dApp's own
   contracts, ever sees another bidder's price.
3. Once the window closes, the confidential module decrypts every bid,
   determines a winner (or that none clears the reserve), and signs the
   result with its own identity key.
4. The auction contract verifies that signature against a registered signer,
   pays the winner's FXRP lot and the seller's proceeds, and refunds every
   other bidder's deposit. Only the winning price is ever made public -
   losing bids stay private forever.

## Architecture

```mermaid
flowchart TB
    subgraph Browser
        Seller[Seller]
        Buyer[Buyer]
        Enc["bidEncryption.ts\n(libsodium sealed box)"]
        Buyer -- "1. price" --> Enc
    end

    subgraph "Coston2 (on-chain)"
        Factory["AuctionFactory\n- TEE signer registry\n- deploys auctions"]
        Auction["SealedBidAuction\n- escrows FXRP\n- commitBid()\n- settle()/settleNoWinner()\n- claimLot/claimProceeds/claimRefund"]
        Factory -- creates --> Auction
    end

    subgraph "Off-chain"
        Relayer["settle-auction.ts\n(reads events, calls settle())"]
        FCE["FCE module (fce/)\nSIMULATION today, FCC-shaped\n- decrypt bids\n- pick winner\n- sign result"]
    end

    Seller -- "deposit FXRP" --> Auction
    Enc -- "commitmentHash + encryptedBid" --> Auction
    Auction -- "BidCommitted events" --> Relayer
    Relayer -- "POST /action" --> FCE
    FCE -- "signed result" --> Relayer
    Relayer -- "settle()" --> Auction
    Auction -- "claimLot / claimProceeds / claimRefund" --> Seller
    Auction -- "claimLot / claimProceeds / claimRefund" --> Buyer
```

## What works today

Everything above is real and has been run end-to-end against live contracts
on Coston2 (chain 114), not just in local tests:

- `contracts/` - `AuctionFactory` + `SealedBidAuction` (Solidity, Foundry),
  19 tests covering the happy path, no-bid/expiry, reserve enforcement, and
  untrusted-signer rejection.
- `fce/` - the confidential compute module, running in **SIMULATION** mode
  (see below), Dockerized, plus the settlement relayer script.
- `frontend/` - Next.js + wagmi: create an auction, submit a sealed bid,
  browse auctions with live countdowns, claim results - with a live FTSO
  XRP/USD reference price on the creation and bidding forms. The dark UI's
  accent palette takes a subtle cue from Flare Network's official brand kit
  (Flare Pink).

Deployed on Coston2:

- `AuctionFactory`: [`0x58158479582bc0BA6bEa5822eaAE01a8Bd6E47A1`](https://coston2-explorer.flare.network/address/0x58158479582bc0ba6bea5822eaae01a8bd6e47a1)

## Why SIMULATION mode

The Flare team confirmed on Discord (17 July 2026) that, since public FCC
(Flare Compute Extension) registration isn't open yet, developers should
build against a simulated TEE on Coston2 for this hackathon. So `fce/` runs
as a plain (Dockerized) service today, implementing the same trust model a
real FCC extension uses - see `fce/README.md`'s "fce-weather-insurance"
comparison - just without the actual `TeeExtensionRegistry`/`ext-proxy`
infrastructure that isn't reachable yet.

## Path to production FCC

This is a deliberate architectural bet: **the contracts never change.**
`SealedBidAuction.settle()` only checks one thing - that a result is signed
by an address `AuctionFactory` currently trusts (`isTrustedSigner`). A real
FCC extension produces exactly that shape of signed result. Moving from
SIMULATION to real FCC is entirely a swap on the off-chain side:

1. Port `fce/src/auction.ts` / `crypto.ts` / `signing.ts`'s decision and
   signing logic into a real extension built on
   `flare-foundation/fce-extension-scaffold`, wired to `OP_TYPE_AUCTION` /
   `OP_COMMAND_SETTLE`.
2. Deploy a real `InstructionSender` and register the extension on
   `TeeExtensionRegistry`.
3. Run it inside a GCP Confidential Space VM with `MODE=0` (real attestation),
   whitelist its code hash.
4. Take the attested TEE address from the proxy's `/info` and call
   `AuctionFactory.registerTeeSigner(realAddress)` - a single owner-only
   transaction, no redeploy, no contract changes.
5. Point `settle-auction.ts` at the real extension's proxy instead of the
   local FCE module's `/action` endpoint.

See `fce/README.md` for the full detail on this transition.

## Repository layout

```
contracts/   Foundry project: AuctionFactory, SealedBidAuction, tests, deploy script
fce/         Confidential compute module (SIMULATION today), settlement relayer
frontend/    Next.js + wagmi dApp
```

Each has its own README with setup/run instructions.

## Roadmap

1. Register a real FCE extension on FCC (Songbird) once public registration
   opens - no contract changes required (see above).
2. Mainnet deployment with real FXRP.
3. Auctions for additional FAssets (FBTC once it launches).
