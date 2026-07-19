import { createConfig, http } from "wagmi";
import { injected, metaMask } from "wagmi/connectors";
import { defineChain } from "viem";

export const coston2 = defineChain({
  id: 114,
  name: "Coston2",
  nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_COSTON2_RPC_URL ?? "https://coston2-api.flare.network/ext/C/rpc"] },
  },
  blockExplorers: {
    default: { name: "Coston2 Explorer", url: "https://coston2-explorer.flare.network" },
  },
  testnet: true,
});

export const wagmiConfig = createConfig({
  chains: [coston2],
  connectors: [metaMask(), injected()],
  transports: {
    [coston2.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
