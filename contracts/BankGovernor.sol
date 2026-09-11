// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";

/// @title BankGovernor
/// @notice DAO governance contract for MiniBank protocol parameters.
/// @dev Uses BKT voting power, simple vote counting, and Timelock execution.
contract BankGovernor is
    Governor,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorTimelockControl
{
    uint256 public proposalThresholdBKT;
    uint256 public quorumPercent; // Example: 4 means 4% of historical BKT supply.

    constructor(
        ERC20Votes _token,
        TimelockController _timelock,
        uint256 _initialProposalThreshold,
        uint256 _initialQuorumPercent
    )
        Governor("BankGovernor")
        GovernorVotes(_token)
        GovernorTimelockControl(_timelock)
    {
        proposalThresholdBKT = _initialProposalThreshold;
        quorumPercent = _initialQuorumPercent;
    }

    /// @notice Updates proposal creation threshold through a successful governance proposal.
    function setProposalThreshold(uint256 newThreshold) external onlyGovernance {
        proposalThresholdBKT = newThreshold;
    }

    /// @notice Updates quorum percentage through a successful governance proposal.
    function setQuorumPercent(uint256 newPercent) external onlyGovernance {
        require(newPercent <= 100, "Too high");
        quorumPercent = newPercent;
    }

    /// @notice Minimum BKT voting power required to create a proposal.
    function proposalThreshold() public view override returns (uint256) {
        return proposalThresholdBKT;
    }

    /// @notice Required voting power participation at a historical block.
    function quorum(uint256 blockNumber) public view override returns (uint256) {
        return token.getPastTotalSupply(blockNumber) * quorumPercent / 100;
    }

    /// @notice Short local-demo voting delay; production governance would use a longer delay.
    function votingDelay() public pure override returns (uint256) {
        return 1;
    }

    /// @notice Short local-demo voting period; production governance would use a longer period.
    function votingPeriod() public pure override returns (uint256) {
        return 4;
    }

    /// @notice Exposes the final executor address for frontend/debug display.
    function viewExecutor() public view returns (address) {
        return _executor();
    }

    function state(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function _execute(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._execute(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(Governor, GovernorTimelockControl)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

}
