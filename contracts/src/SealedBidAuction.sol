// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAuctionFactory} from "./IAuctionFactory.sol";

/// @title SealedBidAuction
/// @notice A single sealed-bid auction for a fixed lot of an ERC20 (FXRP on Flare).
///
/// Bids are committed on-chain only as a hash + an opaque ciphertext blob (emitted in an
/// event, not stored), encrypted client-side to the FCE (Flare Compute Extension / TEE)
/// module's public key. Nobody but the TEE ever sees plaintext bid prices. After the
/// bidding window closes, the off-chain FCE module decrypts every commitment, picks a
/// winner (or determines there is none), and returns a result signed with its registered
/// TEE identity key. This contract only ever trusts a signature from a signer currently
/// registered on the factory - it never decrypts or evaluates bids itself.
///
/// All payouts are pull-based (claim* functions) so no participant, including a
/// misbehaving seller, can block settlement by reverting on a push transfer.
contract SealedBidAuction is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Funding,
        Open,
        Settled,
        NoWinner,
        Expired
    }

    struct Bid {
        address bidder;
        bytes32 commitmentHash;
        uint256 deposit;
        bool refundClaimed;
    }

    address public immutable factory;
    address public immutable seller;
    IERC20 public immutable fxrpToken;
    uint256 public immutable lotAmount;
    uint256 public immutable biddingDeadline;
    uint256 public immutable settlementDeadline;
    uint256 public immutable bidDeposit;
    bool public immutable hasPublicMinPrice;
    uint256 public immutable publicMinPrice;

    State public state;
    address public winner;
    uint256 public finalPrice;
    bool public lotClaimed;
    bool public proceedsClaimed;

    address[] public bidders;
    mapping(address => Bid) public bids;

    event BidCommitted(address indexed bidder, bytes32 commitmentHash, bytes encryptedBid, uint256 deposit);
    event FundingConfirmed(uint256 lotAmountHeld);
    event AuctionSettled(address indexed winner, uint256 winningPrice);
    event AuctionClosedNoWinner();
    event AuctionExpired();
    event LotClaimed(address indexed to, uint256 amount);
    event ProceedsClaimed(address indexed seller, uint256 amount);
    event RefundClaimed(address indexed bidder, uint256 amount);

    modifier onlyFactory() {
        require(msg.sender == factory, "only factory");
        _;
    }

    constructor(
        address _factory,
        address _seller,
        IERC20 _fxrpToken,
        uint256 _lotAmount,
        uint256 _biddingDeadline,
        uint256 _settlementDeadline,
        uint256 _bidDeposit,
        bool _hasPublicMinPrice,
        uint256 _publicMinPrice
    ) {
        require(_seller != address(0), "seller = 0");
        require(_biddingDeadline > block.timestamp, "deadline in past");
        require(_settlementDeadline >= _biddingDeadline, "bad settlement window");

        factory = _factory;
        seller = _seller;
        fxrpToken = _fxrpToken;
        lotAmount = _lotAmount;
        biddingDeadline = _biddingDeadline;
        settlementDeadline = _settlementDeadline;
        bidDeposit = _bidDeposit;
        hasPublicMinPrice = _hasPublicMinPrice;
        publicMinPrice = _publicMinPrice;
        state = State.Funding;
    }

    /// @notice Called once by the factory in the same transaction that funds this
    /// contract, confirming the full lot actually arrived (guards against
    /// non-standard/fee-on-transfer tokens silently under-delivering).
    function confirmFunding() external onlyFactory {
        require(state == State.Funding, "already funded");
        require(fxrpToken.balanceOf(address(this)) >= lotAmount, "lot underfunded");
        state = State.Open;
        emit FundingConfirmed(lotAmount);
    }

    /// @notice Commit a sealed bid. `msg.value` must equal the auction's uniform
    /// `bidDeposit` so that on-chain deposits never reveal relative bid sizes.
    /// `encryptedBid` is the ciphertext (e.g. libsodium sealed box) of the real bid
    /// price, encrypted to the FCE module's public key; it is only ever emitted in an
    /// event, never stored in contract storage.
    function commitBid(bytes32 commitmentHash, bytes calldata encryptedBid) external payable {
        require(state == State.Open, "not open");
        require(block.timestamp < biddingDeadline, "bidding closed");
        require(msg.value == bidDeposit, "wrong deposit");
        require(bids[msg.sender].bidder == address(0), "already bid");

        bids[msg.sender] = Bid({bidder: msg.sender, commitmentHash: commitmentHash, deposit: msg.value, refundClaimed: false});
        bidders.push(msg.sender);

        emit BidCommitted(msg.sender, commitmentHash, encryptedBid, msg.value);
    }

    /// @notice Finalize the auction with a winner, using a result signed by a
    /// currently-registered TEE signer key.
    function settle(address _winner, uint256 winningPrice, bytes calldata signature) external {
        require(state == State.Open, "not open");
        require(block.timestamp >= biddingDeadline, "bidding still open");
        require(block.timestamp <= settlementDeadline, "settlement window expired");
        require(bids[_winner].bidder == _winner, "winner did not bid");
        require(winningPrice <= bidDeposit, "price exceeds deposit");
        if (hasPublicMinPrice) {
            require(winningPrice >= publicMinPrice, "below public reserve");
        }

        bytes32 digest = keccak256(abi.encodePacked(address(this), "SETTLE", _winner, winningPrice));
        address signer = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), signature);
        require(IAuctionFactory(factory).isTrustedSigner(signer), "untrusted signer");

        state = State.Settled;
        winner = _winner;
        finalPrice = winningPrice;

        emit AuctionSettled(_winner, winningPrice);
    }

    /// @notice Finalize the auction with an explicit "no valid winner" result (e.g. zero
    /// bids, or every bid fell below the reserve), signed by a registered TEE signer.
    function settleNoWinner(bytes calldata signature) external {
        require(state == State.Open, "not open");
        require(block.timestamp >= biddingDeadline, "bidding still open");
        require(block.timestamp <= settlementDeadline, "settlement window expired");

        bytes32 digest = keccak256(abi.encodePacked(address(this), "NO_WINNER"));
        address signer = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), signature);
        require(IAuctionFactory(factory).isTrustedSigner(signer), "untrusted signer");

        state = State.NoWinner;
        emit AuctionClosedNoWinner();
    }

    /// @notice Anyone can call this once the settlement window has passed with no
    /// signed result submitted (or immediately after the bidding deadline if there were
    /// no bids at all), releasing the lot back to the seller.
    function reclaimExpired() external {
        require(state == State.Open, "not open");
        require(block.timestamp > biddingDeadline, "bidding still open");
        if (bidders.length > 0) {
            require(block.timestamp > settlementDeadline, "settlement window still active");
        }
        state = State.Expired;
        emit AuctionExpired();
    }

    /// @notice Winner pulls the auctioned FXRP lot after settlement.
    function claimLot() external nonReentrant {
        require(state == State.Settled, "not settled");
        require(msg.sender == winner, "not winner");
        require(!lotClaimed, "already claimed");
        lotClaimed = true;
        fxrpToken.safeTransfer(winner, lotAmount);
        emit LotClaimed(winner, lotAmount);
    }

    /// @notice Seller pulls the winning price (native currency) after settlement.
    function claimProceeds() external nonReentrant {
        require(state == State.Settled, "not settled");
        require(msg.sender == seller, "not seller");
        require(!proceedsClaimed, "already claimed");
        proceedsClaimed = true;
        (bool ok,) = seller.call{value: finalPrice}("");
        require(ok, "transfer failed");
        emit ProceedsClaimed(seller, finalPrice);
    }

    /// @notice Seller reclaims the FXRP lot if there was no winner or the auction expired.
    function reclaimLot() external nonReentrant {
        require(state == State.NoWinner || state == State.Expired, "not reclaimable");
        require(msg.sender == seller, "not seller");
        require(!lotClaimed, "already claimed");
        lotClaimed = true;
        fxrpToken.safeTransfer(seller, lotAmount);
        emit LotClaimed(seller, lotAmount);
    }

    /// @notice Any bidder pulls their deposit back: losers get it in full, the winner
    /// gets back the difference between their fixed deposit and the price they actually
    /// paid, and everyone gets a full refund if there was no winner or the auction expired.
    function claimRefund() external nonReentrant {
        Bid storage b = bids[msg.sender];
        require(b.bidder == msg.sender, "no bid");
        require(!b.refundClaimed, "already claimed");
        require(state == State.Settled || state == State.NoWinner || state == State.Expired, "not finalized");

        uint256 owed;
        if (state == State.Settled && msg.sender == winner) {
            owed = b.deposit - finalPrice;
        } else {
            owed = b.deposit;
        }

        b.refundClaimed = true;
        if (owed > 0) {
            (bool ok,) = msg.sender.call{value: owed}("");
            require(ok, "refund transfer failed");
        }
        emit RefundClaimed(msg.sender, owed);
    }

    function bidderCount() external view returns (uint256) {
        return bidders.length;
    }

    function getBidders() external view returns (address[] memory) {
        return bidders;
    }
}
