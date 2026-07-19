# SealedFlare contracts

Sealed-bid FXRP auctions on Flare. `AuctionFactory` deploys `SealedBidAuction`
instances; sellers escrow FXRP, buyers commit encrypted bids, and the FCE
(Flare Compute Extension) module in `../fce/` decrypts bids off-chain and
signs a settlement result that these contracts verify on-chain. See the repo
root README and `../fce/README.md` for the full architecture.

## Deployed (Coston2, chain 114)

- `AuctionFactory`: [`0x58158479582bc0BA6bEa5822eaAE01a8Bd6E47A1`](https://coston2-explorer.flare.network/address/0x58158479582bc0ba6bea5822eaae01a8bd6e47a1)

## Development

```shell
forge install          # fetch lib/ dependencies (gitignored)
forge build
forge test
```

## Deploying

```shell
cp .env.example .env   # fill in PRIVATE_KEY (never commit .env)
forge script script/Deploy.s.sol:Deploy --rpc-url coston2 --broadcast
```

Optionally set `INITIAL_TEE_SIGNER=0x...` before deploying to register the
FCE module's signing address immediately, or register it later via
`AuctionFactory.registerTeeSigner(address)` (owner-only).
