# SealedFlare — DoraHacks submission materials

Draft copy for the Flare Summer Signal / DoraHacks submission form. Track:
**Confidential Compute Apps**.

---

## Short product description

SealedFlare is a sealed-bid OTC auction platform for FXRP on Flare. A seller
escrows FXRP in a smart contract and opens a bidding window; buyers submit
bids encrypted in the browser to a confidential compute module's public key,
so only a commitment hash and ciphertext ever touch the chain - no one, not
even SealedFlare's own contracts, ever sees another bidder's price. When the
window closes, the confidential module decrypts every bid off-chain,
determines a winner (or that none clears the reserve), and signs the result.
The contract verifies that signature and settles: the winner gets the FXRP
lot, the seller gets paid, everyone else gets their deposit back untouched.
Only the winning price is ever made public.

## The problem

Large FXRP sell orders are visible on-chain before they execute. On a fully
transparent ledger, that's enough for the market to front-run the trade - the
price moves against the seller before the order fills. This is exactly the
kind of workload Flare's Confidential Compute direction exists to unblock:
compute that needs to stay private but still be verifiably correct on-chain.

## Target user

OTC desks, market makers, and individual holders of large FXRP positions who
need to liquidate size without moving the market against themselves -
generally, anyone for whom "everyone can see my order before it fills" is a
dealbreaker. As FAssets expand, the same mechanism extends to any large
FAsset position (FBTC, etc.).

## How Flare is used

- **FCC / FCE (Confidential Compute)**: the core mechanic. A confidential
  module decrypts sealed bids and signs the winning outcome; the auction
  contract only trusts a signature from a registered signer address - the
  same trust model a real Flare Compute Extension produces. We run in
  **SIMULATION mode** today (see below) since public FCC registration isn't
  open yet, on explicit guidance from the Flare team; the architecture is
  built so swapping in a real FCC extension later requires zero contract
  changes.
- **FTSO**: live XRP/USD reference price (block-latency feed, via
  `ContractRegistry` → `FtsoV2`) shown on the auction-creation and
  bid-submission screens, so sellers and bidders have a real market anchor
  when choosing amounts.
- **Escrow on Coston2**: `AuctionFactory` and `SealedBidAuction` (Solidity,
  Foundry, 19 tests) hold the FXRP lot for the auction's duration and handle
  all settlement paths (winner, no-winner, expiry) with pull-based payouts.

## What was built during the hackathon

Everything - the project did not exist before this hackathon. Built from
scratch: the contracts, the confidential compute module and its Docker
packaging, the browser-side bid encryption, the settlement relayer, the FTSO
integration, and the full Next.js/wagmi frontend. Deployed and exercised
end-to-end against live contracts on Coston2 (chain 114), including complete
runs of both the settled-with-a-winner path and the no-winner/expiry path.

## Deployed contracts (Coston2, chain ID 114)

- `AuctionFactory`: [`0x58158479582bc0BA6bEa5822eaAE01a8Bd6E47A1`](https://coston2-explorer.flare.network/address/0x58158479582bc0ba6bea5822eaae01a8bd6e47a1)
  (source verified)

## Links

- Repo: https://github.com/AnubisCrypto666/sealedflare
- Live demo: https://sealedflare-anubis-crypto.vercel.app (browse/create
  auctions and submit sealed bids against the live Coston2 contracts;
  settling an auction needs the FCE module, which only runs locally per the
  repo README - see "Running it yourself")
- Demo video: _TODO - see `DEMO_SCRIPT.md`_

## Roadmap

1. **Register a real FCE extension on FCC** once public registration opens
   (Songbird) - swap SIMULATION for a real attested TEE; the contracts need
   no changes, only `AuctionFactory.registerTeeSigner(realAddress)`.
2. **Mainnet deployment with real FXRP**, once the confidential compute
   module is running on real attested hardware.
3. **Extend to other FAssets** (FBTC once it launches) - the auction
   contracts are already FAsset-agnostic; only the frontend's token picker
   needs to grow.

## Traction

This is a hackathon build with no users yet - being honest about that. The
first people we'll show it to are the FXRP/FAssets community on the Flare
Discord (where the Flare team also confirmed our SIMULATION-mode approach),
since large-holder front-running is a concrete, recognizable problem for
that audience. We'd treat that as informal validation before approaching OTC
desks directly.
