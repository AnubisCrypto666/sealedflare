# SealedFlare — demo video script (2-3 min)

Practical note before recording: a real bidding window takes real time to
close, and the video shouldn't just sit there waiting. Two ways to handle it:

- **Pre-stage two auctions.** One created a few minutes before you start
  recording with a short window (e.g. 5 minutes) that's about to close, so
  by the time you reach the settlement part it's ready to settle live. A
  second one already fully `Settled` from an earlier run, to show the result
  screen and claims immediately without waiting.
- **Cut the wait.** Record the create/bid steps, cut, let the window close in
  real time off-camera, then resume recording for settlement + claims. A
  jump cut with a short title card ("bidding window closes...") reads fine
  for a hackathon demo - judges expect this.

Either way, have the settlement relayer command ready in a terminal so
running it on camera takes seconds, not minutes of typing.

---

## 0:00–0:30 — The problem

**Talking points (voice-over or to camera):**

> "If you're holding a large FXRP position and need to sell, doing it on a
> transparent chain is a problem: the moment your order is visible, the
> market front-runs it and the price moves against you before you fill. This
> is exactly the class of problem Flare's Confidential Compute track exists
> to solve - and that's what we built: sealed-bid OTC auctions for FXRP,
> where nobody sees anyone's price until after the auction is already
> decided."

**On screen:** title card / the README's problem statement, or just talk over
a blank screen - keep this short, it's scene-setting, not the demo.

## 0:30–2:00 — Full auction, end to end

**Talking points + actions:**

1. *(0:30)* "Here's the app - SealedFlare, running against our contracts
   deployed on Flare's Coston2 testnet." Show the auction list page.
2. *(0:40)* "As a seller, I create an auction: I'm putting up 1,000 FXRP,
   the bidding window is short for this demo, and I'm setting a **hidden**
   reserve price - encrypted in my browser before it ever leaves this page,
   so not even our own contract ever learns the number." Walk through the
   create-auction form, submit (two wallet confirmations: approve, then
   create), show the new auction page.
3. *(1:00)* "Now as a buyer, on a second wallet - I submit a sealed bid.
   Notice what actually goes on-chain: I post a fixed collateral deposit,
   same for every bidder, and my real price is encrypted to the confidential
   compute module's key. Nobody watching this chain, including me looking at
   someone else's bid, can tell what anyone actually offered." Submit a bid.
4. *(1:20)* "Once the window closes, here's the part that matters for the
   Confidential Compute track." Switch to a terminal, show the FCE module
   running (`docker ps` or the `/identity` endpoint), then run the
   settlement relayer on camera:
   ```
   npx tsx src/settle-auction.ts <auction address>
   ```
   Narrate while it runs: "This reads the encrypted bids from the chain,
   hands them to the confidential module, which decrypts them, picks a
   winner, and signs the result - then it submits that signed result back
   on-chain."
5. *(1:45)* Refresh the auction page: "Settled. The winning price is the
   *only* number that's now public - every losing bid stays private
   forever." Show the winner claiming the FXRP lot and the seller claiming
   proceeds (one claim button click is enough on camera).

## 2:00–2:30 — Architecture and roadmap

**Talking points:**

> "Under the hood, the contract only ever checks one thing: that the result
> is signed by a key it's told to trust. Today that's a SIMULATION module we
> built and run ourselves, because Flare confirmed public FCC registration
> isn't open yet - but the contracts don't know the difference. When we can
> register a real Flare Compute Extension, we swap this one module for a
> real attested TEE and register its key - zero changes to the contracts
> that already hold the funds. From here: register on real FCC once it
> opens, move to mainnet with real FXRP, and extend the same mechanism to
> other FAssets like FBTC."

**On screen:** the architecture diagram from the repo README (mermaid), or a
simple screen recording scrolling through it.

---

## Recording checklist

- [ ] Two funded Coston2 wallets (seller + buyer) ready before recording
- [ ] FCE module already running (`docker compose up -d` done ahead of time)
- [ ] Pre-staged auctions per the note at the top
- [ ] Settlement relayer command copied and ready to paste
- [ ] Screen recording + mic check
- [ ] English audio or accurate English captions
