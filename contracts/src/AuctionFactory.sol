// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {SealedBidAuction} from "./SealedBidAuction.sol";

/// @title AuctionFactory
/// @notice Deploys SealedBidAuction instances and maintains the registry of TEE signer
/// keys that any of those auctions will accept a settlement signature from. Keeping the
/// registry here (rather than frozen into each auction at creation time) means rotating
/// the FCE module's signing key - e.g. moving from a SIMULATION key to a real FCC
/// attested key - takes effect for auctions already in flight.
contract AuctionFactory is Ownable {
    using SafeERC20 for IERC20;

    mapping(address => bool) public isTrustedSigner;
    address[] public allAuctions;

    event TeeSignerRegistered(address indexed signer);
    event TeeSignerRevoked(address indexed signer);
    event MinPriceCommitted(address indexed auction, bytes encryptedMinPriceBlob);
    event AuctionCreated(
        address indexed auction,
        address indexed seller,
        address indexed fxrpToken,
        uint256 lotAmount,
        uint256 biddingDeadline,
        uint256 settlementDeadline,
        uint256 bidDeposit
    );

    constructor(address initialTeeSigner) Ownable(msg.sender) {
        if (initialTeeSigner != address(0)) {
            isTrustedSigner[initialTeeSigner] = true;
            emit TeeSignerRegistered(initialTeeSigner);
        }
    }

    function registerTeeSigner(address signer) external onlyOwner {
        require(signer != address(0), "zero address");
        isTrustedSigner[signer] = true;
        emit TeeSignerRegistered(signer);
    }

    function revokeTeeSigner(address signer) external onlyOwner {
        isTrustedSigner[signer] = false;
        emit TeeSignerRevoked(signer);
    }

    /// @param fxrpToken FAsset ERC20 being auctioned (FXRP on Coston2).
    /// @param lotAmount Amount of fxrpToken escrowed for sale. Seller must have approved
    /// this factory for at least this amount beforehand.
    /// @param biddingDuration Seconds from now until the bidding window closes.
    /// @param settlementGracePeriod Extra seconds after the bidding deadline during which
    /// the FCE module may submit a signed result before the auction can be reclaimed as
    /// expired.
    /// @param bidDeposit Uniform native-currency collateral every bidder must post; also
    /// the effective cap on any bid, enforced by both the FCE module off-chain and this
    /// contract at settlement.
    /// @param hasPublicMinPrice If true, publicMinPrice is stored and enforced on-chain.
    /// If false, the reserve (if any) is only known to the FCE module via
    /// encryptedMinPriceBlob and is never visible on-chain.
    /// @param encryptedMinPriceBlob Optional ciphertext of the reserve price, encrypted to
    /// the FCE module's public key, emitted as an event for the FCE module to pick up.
    /// Leave empty when hasPublicMinPrice is true or there is no reserve at all.
    function createAuction(
        IERC20 fxrpToken,
        uint256 lotAmount,
        uint256 biddingDuration,
        uint256 settlementGracePeriod,
        uint256 bidDeposit,
        bool hasPublicMinPrice,
        uint256 publicMinPrice,
        bytes calldata encryptedMinPriceBlob
    ) external returns (address auction) {
        require(lotAmount > 0, "lotAmount = 0");
        require(biddingDuration > 0, "duration = 0");
        require(bidDeposit > 0, "bidDeposit = 0");

        uint256 biddingDeadline = block.timestamp + biddingDuration;
        uint256 settlementDeadline = biddingDeadline + settlementGracePeriod;

        SealedBidAuction newAuction = new SealedBidAuction(
            address(this),
            msg.sender,
            fxrpToken,
            lotAmount,
            biddingDeadline,
            settlementDeadline,
            bidDeposit,
            hasPublicMinPrice,
            publicMinPrice
        );
        auction = address(newAuction);
        allAuctions.push(auction);

        fxrpToken.safeTransferFrom(msg.sender, auction, lotAmount);
        newAuction.confirmFunding();

        if (encryptedMinPriceBlob.length > 0) {
            emit MinPriceCommitted(auction, encryptedMinPriceBlob);
        }

        emit AuctionCreated(auction, msg.sender, address(fxrpToken), lotAmount, biddingDeadline, settlementDeadline, bidDeposit);
    }

    function allAuctionsCount() external view returns (uint256) {
        return allAuctions.length;
    }

    function getAllAuctions() external view returns (address[] memory) {
        return allAuctions;
    }
}
