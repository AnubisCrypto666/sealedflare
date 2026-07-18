// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {AuctionFactory} from "../src/AuctionFactory.sol";

/// @notice Deploys AuctionFactory. Individual SealedBidAuction instances are created
/// later on demand via factory.createAuction(...), so only the factory needs deploying.
///
/// INITIAL_TEE_SIGNER is optional and defaults to address(0) (no signer registered yet)
/// since the FCE SIMULATION module and its signing key don't exist until week 2 - the
/// factory owner can call registerTeeSigner(...) once that key exists.
contract Deploy is Script {
    function run() external returns (AuctionFactory factory) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address initialTeeSigner = vm.envOr("INITIAL_TEE_SIGNER", address(0));

        vm.startBroadcast(deployerKey);
        factory = new AuctionFactory(initialTeeSigner);
        vm.stopBroadcast();

        console.log("AuctionFactory deployed at:", address(factory));
        console.log("Deployer / owner:", vm.addr(deployerKey));
        console.log("Initial TEE signer:", initialTeeSigner);
    }
}
