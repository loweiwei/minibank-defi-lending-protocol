// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MiniDAI
/// @notice Local/testnet stablecoin used as the lending and repayment asset in MiniBank.
/// @dev The owner can assign BankV3 as `minter` so the protocol can fund demo flows.
contract MiniDAI is ERC20, ERC20Burnable, Ownable {
    address public minter;

    constructor(address initialOwner) ERC20("MiniDAI", "mDAI") {
        transferOwnership(initialOwner);
    }

    /// @notice Sets the protocol contract allowed to mint/burn for Bank-managed flows.
    function setMinter(address _minter) external onlyOwner {
        minter = _minter;
    }

    /// @notice Mints mDAI for local demo funding or protocol-controlled distribution.
    function mint(address to, uint256 amount) external {
        require(msg.sender == minter || msg.sender == owner(), "Not authorized");
        _mint(to, amount);
    }

    /// @notice Burns mDAI from an account when called by the owner or configured protocol minter.
    function burnFromBank(address from, uint256 amount) external {
        require(msg.sender == minter || msg.sender == owner(), "Not authorized");
        require(balanceOf(from) >= amount, "Insufficient balance to burn");
        _burn(from, amount);
    }
}
