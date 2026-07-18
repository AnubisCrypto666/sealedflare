// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {AuctionFactory} from "../src/AuctionFactory.sol";
import {SealedBidAuction} from "../src/SealedBidAuction.sol";
import {MockFXRP} from "./mocks/MockFXRP.sol";

contract SealedBidAuctionTest is Test {
    AuctionFactory factory;
    MockFXRP fxrp;

    uint256 teeSignerPk = 0xA11CE;
    address teeSigner;

    address seller = makeAddr("seller");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    uint256 constant LOT_AMOUNT = 1_000e18;
    uint256 constant BIDDING_DURATION = 1 days;
    uint256 constant SETTLEMENT_GRACE = 1 hours;
    uint256 constant BID_DEPOSIT = 5 ether;

    function setUp() public {
        teeSigner = vm.addr(teeSignerPk);
        factory = new AuctionFactory(teeSigner);
        fxrp = new MockFXRP();

        fxrp.mint(seller, LOT_AMOUNT);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function _createAuction(bool hasPublicMinPrice, uint256 publicMinPrice, bytes memory encryptedMinPriceBlob)
        internal
        returns (SealedBidAuction auction)
    {
        vm.startPrank(seller);
        fxrp.approve(address(factory), LOT_AMOUNT);
        address a = factory.createAuction(
            fxrp, LOT_AMOUNT, BIDDING_DURATION, SETTLEMENT_GRACE, BID_DEPOSIT, hasPublicMinPrice, publicMinPrice, encryptedMinPriceBlob
        );
        vm.stopPrank();
        auction = SealedBidAuction(a);
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _settleSig(SealedBidAuction auction, address winner, uint256 price, uint256 pk)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 digest = keccak256(abi.encodePacked(address(auction), "SETTLE", winner, price));
        return _sign(pk, digest);
    }

    function _noWinnerSig(SealedBidAuction auction, uint256 pk) internal pure returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(address(auction), "NO_WINNER"));
        return _sign(pk, digest);
    }

    // ---------------------------------------------------------------------
    // Happy path
    // ---------------------------------------------------------------------

    function test_FullAuctionLifecycle_WinnerAndLoserSettleCorrectly() public {
        SealedBidAuction auction = _createAuction(false, 0, "");

        assertEq(uint256(auction.state()), uint256(SealedBidAuction.State.Open));
        assertEq(fxrp.balanceOf(address(auction)), LOT_AMOUNT);

        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("alice-commitment"), hex"aabbcc");

        vm.prank(bob);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("bob-commitment"), hex"ddeeff");

        assertEq(auction.bidderCount(), 2);

        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        uint256 winningPrice = 3 ether;
        bytes memory sig = _settleSig(auction, alice, winningPrice, teeSignerPk);
        auction.settle(alice, winningPrice, sig);

        assertEq(uint256(auction.state()), uint256(SealedBidAuction.State.Settled));
        assertEq(auction.winner(), alice);
        assertEq(auction.finalPrice(), winningPrice);

        // Winner claims the lot.
        vm.prank(alice);
        auction.claimLot();
        assertEq(fxrp.balanceOf(alice), LOT_AMOUNT);

        // Seller claims proceeds.
        uint256 sellerBalBefore = seller.balance;
        vm.prank(seller);
        auction.claimProceeds();
        assertEq(seller.balance, sellerBalBefore + winningPrice);

        // Winner reclaims excess deposit.
        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        auction.claimRefund();
        assertEq(alice.balance, aliceBalBefore + (BID_DEPOSIT - winningPrice));

        // Loser gets full deposit back.
        uint256 bobBalBefore = bob.balance;
        vm.prank(bob);
        auction.claimRefund();
        assertEq(bob.balance, bobBalBefore + BID_DEPOSIT);
    }

    function test_ThreeBidders_ArbitraryWinnerPickedOffChain_OthersFullyRefunded() public {
        SealedBidAuction auction = _createAuction(false, 0, "");

        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
        vm.prank(bob);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("b"), hex"02");
        vm.prank(carol);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("c"), hex"03");

        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        // Simulates a tie broken off-chain by the FCE module (e.g. earliest commitment
        // wins) - the contract has no opinion on how the winner among equal bids was
        // chosen, it only verifies the signed result.
        bytes memory sig = _settleSig(auction, bob, 2 ether, teeSignerPk);
        auction.settle(bob, 2 ether, sig);

        vm.prank(alice);
        auction.claimRefund();
        assertEq(alice.balance, 100 ether); // untouched, full refund

        vm.prank(carol);
        auction.claimRefund();
        assertEq(carol.balance, 100 ether);
    }

    // ---------------------------------------------------------------------
    // No bids / expiry
    // ---------------------------------------------------------------------

    function test_NoBids_SellerReclaimsImmediatelyAfterDeadline() public {
        SealedBidAuction auction = _createAuction(false, 0, "");

        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        // No need to wait out the settlement grace period when there were no bids.
        auction.reclaimExpired();
        assertEq(uint256(auction.state()), uint256(SealedBidAuction.State.Expired));

        vm.prank(seller);
        auction.reclaimLot();
        assertEq(fxrp.balanceOf(seller), LOT_AMOUNT);
    }

    function test_BidsButNoSettlement_ExpiresAfterGracePeriod_BiddersRefunded() public {
        SealedBidAuction auction = _createAuction(false, 0, "");

        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");

        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        // Too early - bids exist, so must wait out the settlement grace period.
        vm.expectRevert("settlement window still active");
        auction.reclaimExpired();

        vm.warp(block.timestamp + SETTLEMENT_GRACE + 1);
        auction.reclaimExpired();
        assertEq(uint256(auction.state()), uint256(SealedBidAuction.State.Expired));

        vm.prank(seller);
        auction.reclaimLot();
        assertEq(fxrp.balanceOf(seller), LOT_AMOUNT);

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        auction.claimRefund();
        assertEq(alice.balance, aliceBalBefore + BID_DEPOSIT);
    }

    function test_SettleNoWinner_AllBiddersRefundedAndSellerReclaims() public {
        SealedBidAuction auction = _createAuction(false, 0, "");

        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
        vm.prank(bob);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("b"), hex"02");

        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        bytes memory sig = _noWinnerSig(auction, teeSignerPk);
        auction.settleNoWinner(sig);
        assertEq(uint256(auction.state()), uint256(SealedBidAuction.State.NoWinner));

        vm.prank(seller);
        auction.reclaimLot();
        assertEq(fxrp.balanceOf(seller), LOT_AMOUNT);

        vm.prank(alice);
        auction.claimRefund();
        vm.prank(bob);
        auction.claimRefund();
        assertEq(alice.balance, 100 ether);
        assertEq(bob.balance, 100 ether);
    }

    // ---------------------------------------------------------------------
    // Reserve price enforcement
    // ---------------------------------------------------------------------

    function test_PublicMinPrice_RejectsWinningPriceBelowReserve() public {
        SealedBidAuction auction = _createAuction(true, 4 ether, "");

        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");

        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        bytes memory sig = _settleSig(auction, alice, 3 ether, teeSignerPk);
        vm.expectRevert("below public reserve");
        auction.settle(alice, 3 ether, sig);
    }

    function test_HiddenMinPrice_StoresNoPlaintextOnChain_EmitsEncryptedBlob() public {
        bytes memory blob = hex"deadbeef";

        vm.startPrank(seller);
        fxrp.approve(address(factory), LOT_AMOUNT);
        vm.expectEmit(false, false, false, true);
        emit AuctionFactory.MinPriceCommitted(address(0), blob);
        address a = factory.createAuction(fxrp, LOT_AMOUNT, BIDDING_DURATION, SETTLEMENT_GRACE, BID_DEPOSIT, false, 0, blob);
        vm.stopPrank();

        // hidden mode: contract cannot know or enforce the reserve, only the TEE can.
        SealedBidAuction auction = SealedBidAuction(a);
        assertFalse(auction.hasPublicMinPrice());
        assertEq(auction.publicMinPrice(), 0);
    }

    // ---------------------------------------------------------------------
    // Validation / guard rails
    // ---------------------------------------------------------------------

    function test_RevertWhen_DepositAmountWrong() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.prank(alice);
        vm.expectRevert("wrong deposit");
        auction.commitBid{value: BID_DEPOSIT - 1}(keccak256("a"), hex"01");
    }

    function test_RevertWhen_BiddingTwice() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.startPrank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
        vm.expectRevert("already bid");
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a2"), hex"02");
        vm.stopPrank();
    }

    function test_RevertWhen_BiddingAfterDeadline() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.warp(block.timestamp + BIDDING_DURATION + 1);
        vm.prank(alice);
        vm.expectRevert("bidding closed");
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
    }

    function test_RevertWhen_UntrustedSignerSettles() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        uint256 rogueKey = 0xBAD;
        bytes memory sig = _settleSig(auction, alice, 1 ether, rogueKey);
        vm.expectRevert("untrusted signer");
        auction.settle(alice, 1 ether, sig);
    }

    function test_RevertWhen_WinnerNeverBid() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.warp(block.timestamp + BIDDING_DURATION + 1);
        bytes memory sig = _settleSig(auction, alice, 1 ether, teeSignerPk);
        vm.expectRevert("winner did not bid");
        auction.settle(alice, 1 ether, sig);
    }

    function test_RevertWhen_WinningPriceExceedsDeposit() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        bytes memory sig = _settleSig(auction, alice, BID_DEPOSIT + 1, teeSignerPk);
        vm.expectRevert("price exceeds deposit");
        auction.settle(alice, BID_DEPOSIT + 1, sig);
    }

    function test_RevertWhen_SettlingBeforeDeadline() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");

        bytes memory sig = _settleSig(auction, alice, 1 ether, teeSignerPk);
        vm.expectRevert("bidding still open");
        auction.settle(alice, 1 ether, sig);
    }

    function test_RevertWhen_SettlingAfterSettlementWindowExpired() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
        vm.warp(block.timestamp + BIDDING_DURATION + SETTLEMENT_GRACE + 1);

        bytes memory sig = _settleSig(auction, alice, 1 ether, teeSignerPk);
        vm.expectRevert("settlement window expired");
        auction.settle(alice, 1 ether, sig);
    }

    function test_RevertWhen_NonWinnerClaimsLot() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
        vm.warp(block.timestamp + BIDDING_DURATION + 1);
        bytes memory sig = _settleSig(auction, alice, 1 ether, teeSignerPk);
        auction.settle(alice, 1 ether, sig);

        vm.prank(bob);
        vm.expectRevert("not winner");
        auction.claimLot();
    }

    function test_RevertWhen_ClaimingLotTwice() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
        vm.warp(block.timestamp + BIDDING_DURATION + 1);
        bytes memory sig = _settleSig(auction, alice, 1 ether, teeSignerPk);
        auction.settle(alice, 1 ether, sig);

        vm.startPrank(alice);
        auction.claimLot();
        vm.expectRevert("already claimed");
        auction.claimLot();
        vm.stopPrank();
    }

    function test_RevertWhen_TeeSignerRevoked() public {
        SealedBidAuction auction = _createAuction(false, 0, "");
        vm.prank(alice);
        auction.commitBid{value: BID_DEPOSIT}(keccak256("a"), hex"01");
        vm.warp(block.timestamp + BIDDING_DURATION + 1);

        factory.revokeTeeSigner(teeSigner);

        bytes memory sig = _settleSig(auction, alice, 1 ether, teeSignerPk);
        vm.expectRevert("untrusted signer");
        auction.settle(alice, 1 ether, sig);
    }

    function test_RevertWhen_NonOwnerRegistersSigner() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.registerTeeSigner(alice);
    }
}
