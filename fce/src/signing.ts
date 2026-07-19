import { encodePacked, keccak256, type Address, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

/**
 * Reproduces SealedBidAuction.sol's settle() digest exactly:
 *   keccak256(abi.encodePacked(address(this), "SETTLE", _winner, winningPrice))
 * then EIP-191 personal-sign, verified on-chain via
 * ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), signature).
 */
export async function signWinnerResult(
  signingAccount: PrivateKeyAccount,
  auctionAddress: Address,
  winner: Address,
  winningPrice: bigint,
): Promise<Hex> {
  const digest = keccak256(
    encodePacked(["address", "string", "address", "uint256"], [auctionAddress, "SETTLE", winner, winningPrice]),
  );
  return signingAccount.signMessage({ message: { raw: digest } });
}

/**
 * Reproduces SealedBidAuction.sol's settleNoWinner() digest exactly:
 *   keccak256(abi.encodePacked(address(this), "NO_WINNER"))
 */
export async function signNoWinnerResult(signingAccount: PrivateKeyAccount, auctionAddress: Address): Promise<Hex> {
  const digest = keccak256(encodePacked(["address", "string"], [auctionAddress, "NO_WINNER"]));
  return signingAccount.signMessage({ message: { raw: digest } });
}
