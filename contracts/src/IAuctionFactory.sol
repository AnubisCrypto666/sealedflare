// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Minimal view used by SealedBidAuction to check the live TEE signer registry,
/// so key rotation on the factory takes effect for auctions already in flight.
interface IAuctionFactory {
    function isTrustedSigner(address signer) external view returns (bool);
}
