const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MiniBank comprehensive on-chain flow", function () {
  async function deployProtocol() {
    const [deployer, lp, borrower, liquidator, reserveRecipient, lp2] = await ethers.getSigners();

    const PriceOracle = await ethers.getContractFactory("PriceOracle");
    const oracle = await PriceOracle.deploy();
    await oracle.waitForDeployment();
    await oracle.setPrice(ethers.parseUnits("1000", 8));

    const MiniDAI = await ethers.getContractFactory("MiniDAI");
    const miniDai = await MiniDAI.deploy(deployer.address);
    await miniDai.waitForDeployment();

    const BankToken = await ethers.getContractFactory("BankToken");
    const bankToken = await BankToken.deploy(ethers.parseUnits("1000000", 18));
    await bankToken.waitForDeployment();

    const AMDAI = await ethers.getContractFactory("aMDAI");
    const aMDAI = await AMDAI.deploy();
    await aMDAI.waitForDeployment();

    const BankV3 = await ethers.getContractFactory("BankV3");
    const bank = await BankV3.deploy(
      await miniDai.getAddress(),
      await oracle.getAddress(),
      deployer.address,
      await bankToken.getAddress(),
      await aMDAI.getAddress()
    );
    await bank.waitForDeployment();

    await miniDai.setMinter(await bank.getAddress());
    await aMDAI.setBank(await bank.getAddress());

    const BankTimelock = await ethers.getContractFactory("BankTimelock");
    const timelock = await BankTimelock.deploy(20, [], [ethers.ZeroAddress], deployer.address);
    await timelock.waitForDeployment();

    const BankGovernor = await ethers.getContractFactory("BankGovernor");
    const governor = await BankGovernor.deploy(
      await bankToken.getAddress(),
      await timelock.getAddress(),
      ethers.parseUnits("0.1", 18),
      2
    );
    await governor.waitForDeployment();

    await bank.setGovernance(await timelock.getAddress());

    await timelock.grantRole(await timelock.PROPOSER_ROLE(), await governor.getAddress());
    await timelock.grantRole(await timelock.EXECUTOR_ROLE(), ethers.ZeroAddress);

    await bankToken.transfer(await timelock.getAddress(), ethers.parseUnits("600000", 18));
    await bankToken.transfer(await bank.getAddress(), ethers.parseUnits("200000", 18));

    for (const account of [lp, borrower, liquidator, lp2]) {
      await miniDai.mint(account.address, ethers.parseUnits("20000", 18));
    }

    return { deployer, lp, borrower, liquidator, reserveRecipient, lp2, oracle, miniDai, bankToken, aMDAI, bank, timelock, governor };
  }

  async function runGovernanceProposal({ deployer, reserveRecipient, bank, governor, bankToken }) {
    await bankToken.delegate(deployer.address);
    await ethers.provider.send("evm_mine", []);

    const bankAddress = await bank.getAddress();
    const governorAddress = await governor.getAddress();
    const injectedAmount = ethers.parseUnits("1", 18);
    const withdrawnAmount = ethers.parseUnits("1", 18);

    const targets = [
      bankAddress,
      bankAddress,
      bankAddress,
      bankAddress,
      bankAddress,
      bankAddress,
      bankAddress,
      bankAddress,
      bankAddress,
      bankAddress,
      bankAddress,
      governorAddress,
      governorAddress,
    ];
    const values = targets.map(() => 0);
    const calldatas = [
      bank.interface.encodeFunctionData("setInterestRate", [700]),
      bank.interface.encodeFunctionData("setDailyCap", [ethers.parseUnits("500", 18)]),
      bank.interface.encodeFunctionData("setReserveFactor", [1200]),
      bank.interface.encodeFunctionData("setMaxTotalDebt", [ethers.parseUnits("2000000", 18)]),
      bank.interface.encodeFunctionData("setRewardRatio", [123456789]),
      bank.interface.encodeFunctionData("setLPRewardRatio", [400000000000n]),
      bank.interface.encodeFunctionData("setBorrowerRewardRatio", [200000000000n]),
      bank.interface.encodeFunctionData("injectProtocolEarningsToLP", [injectedAmount]),
      bank.interface.encodeFunctionData("withdrawTokenReserve", [reserveRecipient.address, withdrawnAmount]),
      bank.interface.encodeFunctionData("changeStatus", [1]),
      bank.interface.encodeFunctionData("changeStatus", [0]),
      governor.interface.encodeFunctionData("setProposalThreshold", [ethers.parseUnits("0.2", 18)]),
      governor.interface.encodeFunctionData("setQuorumPercent", [3]),
    ];

    const description = `comprehensive governance update ${Date.now()}`;
    const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));
    const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);

    await governor.propose(targets, values, calldatas, description);
    await ethers.provider.send("evm_mine", []);
    await ethers.provider.send("evm_mine", []);

    expect(await governor.state(proposalId)).to.equal(1);
    await governor.castVote(proposalId, 1);

    for (let i = 0; i < 5; i++) {
      await ethers.provider.send("evm_mine", []);
    }

    expect(await governor.state(proposalId)).to.equal(4);
    await governor.queue(targets, values, calldatas, descriptionHash);
    expect(await governor.state(proposalId)).to.equal(5);

    await ethers.provider.send("evm_increaseTime", [25]);
    await ethers.provider.send("evm_mine", []);
    await governor.execute(targets, values, calldatas, descriptionHash);

    expect(await governor.state(proposalId)).to.equal(7);
  }

  it("covers deploy, LP, borrow, repay, withdraw, liquidation, rewards, reserves, and DAO governance", async function () {
    const ctx = await deployProtocol();
    const { lp, borrower, liquidator, reserveRecipient, lp2, oracle, miniDai, bankToken, aMDAI, bank, timelock, governor } = ctx;

    expect(await bank.governance()).to.equal(await timelock.getAddress());
    expect(await miniDai.minter()).to.equal(await bank.getAddress());
    expect(await aMDAI.bank()).to.equal(await bank.getAddress());
    expect(await bank.getStatus()).to.equal(0);

    await miniDai.connect(lp).approve(await bank.getAddress(), ethers.parseUnits("5000", 18));
    await expect(bank.connect(lp).supply(ethers.parseUnits("5000", 18)))
      .to.emit(bank, "Supplied");

    await miniDai.connect(lp2).approve(await bank.getAddress(), ethers.parseUnits("1000", 18));
    await expect(bank.connect(lp2).supply(ethers.parseUnits("1000", 18)))
      .to.emit(bank, "Supplied");

    expect(await bank.getTotalSupplied()).to.equal(ethers.parseUnits("6000", 18));
    expect(await aMDAI.balanceOf(lp.address)).to.equal(ethers.parseUnits("5000", 18));
    expect(await aMDAI.balanceOf(lp2.address)).to.equal(ethers.parseUnits("1000", 18));

    await expect(bank.connect(borrower).depositCollateral({ value: ethers.parseEther("2") }))
      .to.emit(bank, "CollateralDeposited");
    await bank.connect(borrower).borrow(ethers.parseUnits("1000", 18));

    const borrowerDebtAfterBorrow = await bank.getTotalDebt(borrower.address);
    expect(borrowerDebtAfterBorrow).to.be.greaterThanOrEqual(ethers.parseUnits("1000", 18));
    expect(await miniDai.balanceOf(borrower.address)).to.be.greaterThanOrEqual(ethers.parseUnits("21000", 18));

    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);

    const debtBeforeRepay = await bank.getTotalDebt(borrower.address);
    await miniDai.connect(borrower).approve(await bank.getAddress(), ethers.parseUnits("100", 18));
    await expect(bank.connect(borrower).repay(ethers.parseUnits("100", 18)))
      .to.emit(bank, "RepaidDetailed");
    expect(await bank.getTotalDebt(borrower.address)).to.be.lessThan(debtBeforeRepay);
    expect(await bank.getProtocolTokenReserve()).to.be.greaterThan(0);

    const maxWithdraw = await bank.getMaxWithdrawableETH(borrower.address);
    expect(maxWithdraw).to.be.greaterThan(ethers.parseEther("0.1"));
    const collateralBeforeWithdraw = await bank.collateral(borrower.address);
    await bank.connect(borrower).withdrawCollateral(ethers.parseEther("0.1"));
    expect(await bank.collateral(borrower.address)).to.equal(collateralBeforeWithdraw - ethers.parseEther("0.1"));

    await ethers.provider.send("evm_increaseTime", [2 * 86400]);
    await ethers.provider.send("evm_mine", []);

    const lpRewardPreview = await bank.getPendingReward(lp.address, true);
    const borrowerRewardPreview = await bank.getPendingReward(borrower.address, false);
    expect(lpRewardPreview).to.be.greaterThan(0);
    expect(borrowerRewardPreview).to.be.greaterThan(0);

    await expect(bank.connect(lp).claimReward(true)).to.emit(bank, "RewardClaimed");
    await expect(bank.connect(borrower).claimReward(false)).to.emit(bank, "RewardClaimed");
    expect(await bankToken.balanceOf(lp.address)).to.be.greaterThan(0);
    expect(await bankToken.balanceOf(borrower.address)).to.be.greaterThan(0);

    await oracle.setPrice(ethers.parseUnits("350", 8));
    const hfBeforeLiquidation = await bank.getHealthFactor(borrower.address);
    expect(hfBeforeLiquidation).to.be.lessThan(await bank.LIQUIDATION_THRESHOLD());

    const borrowerCollateralBefore = await bank.collateral(borrower.address);
    const borrowerDebtBeforeLiquidation = await bank.getTotalDebt(borrower.address);
    await miniDai.connect(liquidator).approve(await bank.getAddress(), ethers.parseUnits("200", 18));
    await expect(bank.connect(liquidator).liquidate(borrower.address, ethers.parseUnits("200", 18)))
      .to.emit(bank, "Liquidated");

    expect(await bank.collateral(borrower.address)).to.be.lessThan(borrowerCollateralBefore);
    expect(await bank.getTotalDebt(borrower.address)).to.be.lessThan(borrowerDebtBeforeLiquidation);
    expect(await bank.estimateMaxLiquidate(borrower.address)).to.be.greaterThanOrEqual(0);
    expect(await bank.getLiquidationPrice(borrower.address)).to.be.greaterThan(0);

    const lpBalanceBeforeRedeem = await miniDai.balanceOf(lp.address);
    await expect(bank.connect(lp).redeem(ethers.parseUnits("500", 18)))
      .to.emit(bank, "Redeemed");
    expect(await miniDai.balanceOf(lp.address)).to.be.greaterThan(lpBalanceBeforeRedeem);
    expect(await bank.getExchangeRate()).to.be.greaterThan(0);

    const reserveBeforeGovernance = await bank.getProtocolTokenReserve();
    expect(reserveBeforeGovernance).to.be.greaterThan(ethers.parseUnits("2", 18));
    const recipientBalanceBefore = await miniDai.balanceOf(reserveRecipient.address);

    await runGovernanceProposal(ctx);

    expect(await bank.getInterestRate()).to.equal(700);
    expect(await bank.dailyCap()).to.equal(ethers.parseUnits("500", 18));
    expect(await bank.reserveFactor()).to.equal(1200);
    expect(await bank.maxTotalDebt()).to.equal(ethers.parseUnits("2000000", 18));
    expect(await bank.rewardRatio()).to.equal(123456789);
    expect(await bank.lpRewardRatio()).to.equal(400000000000n);
    expect(await bank.borrowerRewardRatio()).to.equal(200000000000n);
    expect(await bank.getStatus()).to.equal(0);
    expect(await governor.proposalThreshold()).to.equal(ethers.parseUnits("0.2", 18));
    expect(await governor.quorumPercent()).to.equal(3);
    expect(await miniDai.balanceOf(reserveRecipient.address)).to.equal(recipientBalanceBefore + ethers.parseUnits("1", 18));

    const [userShare, totalShares, sharePercent, redeemable] = await bank.getLPInfo(lp.address);
    expect(userShare).to.be.greaterThan(0);
    expect(totalShares).to.be.greaterThan(0);
    expect(sharePercent).to.be.greaterThan(0);
    expect(redeemable).to.be.greaterThan(0);

    await bank.getBorrowerRewardInfo(borrower.address);
    await bank.getRewardPreviewCapped(lp.address, true);
    await bank.getUnclaimedReward(borrower.address, false);
    await bank.previewInterest(borrower.address);
    await bank.debugDebtDetail(borrower.address);
    await bank.debugElapsed(borrower.address);
  });
});
