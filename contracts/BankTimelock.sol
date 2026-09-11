// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title BankTimelock
/// @notice Timelock layer for MiniBank governance actions.
/// @dev Governor queues successful proposals here before they can execute BankV3 parameter changes.
contract BankTimelock is TimelockController {
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) TimelockController(minDelay, proposers, executors, admin) {}
}
