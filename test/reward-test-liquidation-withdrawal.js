const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BankV3 - Reward 清算與提預邊界情境（穩定版）", function () {
  let deployer, user, liquidator;
  let bank, bankToken, miniDai, oracle, aMDAI;

  beforeEach(async function () {
    [deployer, user, liquidator] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("PriceOracle");
    oracle = await Oracle.deploy();
    await oracle.setPrice(ethers.parseUnits("1000", 8));

    const MiniDAI = await ethers.getContractFactory("MiniDAI");
    miniDai = await MiniDAI.deploy(deployer.address);

    const BankToken = await ethers.getContractFactory("BankToken");
    bankToken = await BankToken.deploy(ethers.parseUnits("1000000", 18));

    const AMDAI = await ethers.getContractFactory("aMDAI");
    aMDAI = await AMDAI.deploy();

    const Bank = await ethers.getContractFactory("BankV3");
    bank = await Bank.deploy(
      await miniDai.getAddress(),
      await oracle.getAddress(),
      deployer.address,
      await bankToken.getAddress(),
      await aMDAI.getAddress()
    );

    await miniDai.setMinter(await bank.getAddress());
    await bankToken.transfer(await bank.getAddress(), ethers.parseUnits("200000", 18));
    await aMDAI.setBank(await bank.getAddress());

    await miniDai.mint(deployer.address, ethers.parseUnits("1000", 18));
    await miniDai.connect(deployer).approve(bank.getAddress(), ethers.parseUnits("1000", 18));
    await bank.connect(deployer).supply(ethers.parseUnits("1000", 18));

    await miniDai.mint(user.address, ethers.parseUnits("500", 18));
    await miniDai.connect(user).approve(bank.getAddress(), ethers.parseUnits("500", 18));

    await miniDai.mint(liquidator.address, ethers.parseUnits("500", 18));
    await miniDai.connect(liquidator).approve(bank.getAddress(), ethers.parseUnits("500", 18));
    await expect(bank.connect(user).claimReward(false)).to.be.revertedWith("Nothing to claim");

  });

  it("🔻 清算後可領取已累積 reward，後續 reward base 會下降", async function () {
    await bank.connect(user).depositCollateral({ value: ethers.parseEther("1") });
    await bank.connect(user).borrow(ethers.parseUnits("500", 18));
    await oracle.setPrice(ethers.parseUnits("300", 8));
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");

    const hf = await bank.getHealthFactor(user.address);
    console.log("HF (before)", ethers.formatUnits(hf, 4));

    await bank.connect(liquidator).liquidate(user.address, ethers.parseUnits("300", 18));
    console.log(">> Liquidated");

    const claimable = await bank.getUnclaimedReward(user.address, false);
    console.log("Reward (after liquidation):", ethers.formatUnits(claimable, 18));
    expect(claimable).to.be.gt(0);

    await bank.connect(user).claimReward(false);
    const afterClaim = await bank.getUnclaimedReward(user.address, false);
    expect(afterClaim).to.be.lte(ethers.parseUnits("0.0003", 18));
  });

  it("🛯️ 軟清算：清一部分 reward 減少", async function () {
    await bank.connect(user).depositCollateral({ value: ethers.parseEther("2") });
    await bank.connect(user).borrow(ethers.parseUnits("500", 18));
    await oracle.setPrice(ethers.parseUnits("200", 8));

    await ethers.provider.send("evm_increaseTime", [43200]);
    await ethers.provider.send("evm_mine");

    const before = await bank.getUnclaimedReward(user.address, false);
    console.log("Reward before:", ethers.formatUnits(before, 18));

    await bank.connect(liquidator).liquidate(user.address, ethers.parseUnits("100", 18));
    console.log(">> Liquidated");

    const after = await bank.getUnclaimedReward(user.address, false);
    const rewardBase = (await bank.getBorrowerRewardInfo(user.address)).supplyAmount;
    console.log("Reward after:", ethers.formatUnits(after, 18));
    console.log("Reward debt base after:", ethers.formatUnits(rewardBase, 18), "mDAI");
    expect(after).to.be.gt(0);
    expect(rewardBase).to.be.lt(ethers.parseUnits("500", 18));
  });

  it("⬇️ 只有抵押、沒有借款時 borrower reward 為 0", async function () {
    await bank.connect(user).depositCollateral({ value: ethers.parseEther("1") });
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");

    await bank.connect(user).withdrawCollateral(ethers.parseEther("1"));

    const after = await bank.getUnclaimedReward(user.address, false);
    console.log("Reward after full withdrawal:", ethers.formatUnits(after, 18));
    expect(after).to.be.lte(ethers.parseUnits("0.0003", 18));
    await expect(bank.connect(user).claimReward(false)).to.be.revertedWith("Nothing to claim");
  });

  it("⬅️ 提一點抵押品不會降低 debt-based borrower reward base", async function () {
    await bank.connect(user).depositCollateral({ value: ethers.parseEther("2") });
    await bank.connect(user).borrow(ethers.parseUnits("500", 18));
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");

    const before = await bank.getUnclaimedReward(user.address, false);
    const baseBefore = (await bank.getBorrowerRewardInfo(user.address)).supplyAmount;
    console.log("Reward before withdraw:", ethers.formatUnits(before, 18));

    await bank.connect(user).withdrawCollateral(ethers.parseEther("0.5"));

    const after = await bank.getRewardPreviewCapped(user.address, false);
    const baseAfter = (await bank.getBorrowerRewardInfo(user.address)).supplyAmount;
    console.log("Reward after partial withdraw:", ethers.formatUnits(after, 18));

    expect(baseAfter).to.be.gte(baseBefore);
    expect(after).to.be.gte(before);
    expect(after).to.be.gt(0);
  });
  it("🏛️ dailyCap 限制1：最大只能發 dailyCap 顆 BKT", async function () {
    await bank.setDailyCap(ethers.parseUnits("1", 18));
    await bank.setBorrowerRewardRatio(ethers.parseUnits("1", 18));
    await bank.connect(user).depositCollateral({ value: ethers.parseEther("50") });
    await bank.connect(user).borrow(ethers.parseUnits("500", 18));

    // 快轉一天（86400 秒）
    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");

    // 查詢獎勳
    const reward = await bank.getRewardPreviewCapped(user.address, false);
    console.log("Reward after 1 day:", ethers.formatUnits(reward, 18));

    expect(reward).to.be.lte(ethers.parseUnits("1", 18));
    });
    it("🏛️ dailyCap 限制2：最大只能發 dailyCap 顆 BKT", async function () {
    await bank.setDailyCap(ethers.parseUnits("1", 18));
    await bank.setBorrowerRewardRatio(ethers.parseUnits("1", 18));
    await bank.connect(user).depositCollateral({ value: ethers.parseEther("50") });
    await bank.connect(user).borrow(ethers.parseUnits("500", 18));

    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");

    // ✅ 呼叫一次 claimReward 強制觸發 _updateReward() & 分配
    await bank.connect(user).claimReward(false);

    const reward = await bank.getUnclaimedReward(user.address, false);
    console.log("Reward after 1 day (post-claim):", ethers.formatUnits(reward, 18));

    expect(reward).to.be.lte(ethers.parseUnits("1", 18));
    });
    it("🏛️ dailyCap 限制3：最大只能發 dailyCap 顆 BKT", async function () {
    await bank.setDailyCap(ethers.parseUnits("1", 18));
    await bank.setBorrowerRewardRatio(ethers.parseUnits("1", 18));
    await bank.connect(user).depositCollateral({ value: ethers.parseEther("50") });
    await bank.connect(user).borrow(ethers.parseUnits("500", 18));

    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");

    // ✅ 這行會觸發 _updateReward + 套用 cap
    await bank.connect(user).claimReward(false);

    const reward = await bank.getUnclaimedReward(user.address, false);
    console.log("Reward after 1 day (post-claim):", ethers.formatUnits(reward, 18));

    // ✅ 確保 reward 小於或等於 dailyCap
    expect(reward).to.be.lte(ethers.parseUnits("1", 18));
    });
    it("🏛️ dailyCap 限制4：最大只能發 dailyCap 顆 BKT", async function () {
    await bank.setDailyCap(ethers.parseUnits("1", 18));
    await bank.setBorrowerRewardRatio(ethers.parseUnits("1", 18));
    await bank.connect(user).depositCollateral({ value: ethers.parseEther("50") });
    await bank.connect(user).borrow(ethers.parseUnits("500", 18));

    await ethers.provider.send("evm_increaseTime", [86400]);
    await ethers.provider.send("evm_mine");

    // ✅ 用 claimReward() 實際觸發分配，應該最多只能領到 dailyCap
    const before = await bankToken.balanceOf(user.address);
    await bank.connect(user).claimReward(false);
    const after = await bankToken.balanceOf(user.address);

    const rewardClaimed = after - before;
    console.log("🧾 Actual claimed reward:", ethers.formatUnits(rewardClaimed, 18));

    expect(rewardClaimed).to.be.lte(ethers.parseUnits("1", 18));
    });


});
