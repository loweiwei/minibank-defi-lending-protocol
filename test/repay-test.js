const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BankV3 Repay Test", function () {
  let owner, user;
  let bank, miniDai, bankToken, aMDAI, oracle;

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    const Oracle = await ethers.getContractFactory("PriceOracle");
    oracle = await Oracle.deploy();
    await oracle.waitForDeployment();
    await oracle.setPrice(ethers.parseUnits("1000", 8));

    const MiniDAI = await ethers.getContractFactory("MiniDAI");
    miniDai = await MiniDAI.deploy(owner.address);
    await miniDai.waitForDeployment();

    const BankToken = await ethers.getContractFactory("BankToken");
    bankToken = await BankToken.deploy(ethers.parseUnits("1000000", 18));
    await bankToken.waitForDeployment();

    const AMDAI = await ethers.getContractFactory("aMDAI");
    aMDAI = await AMDAI.deploy();
    await aMDAI.waitForDeployment();

    const Bank = await ethers.getContractFactory("BankV3");
    bank = await Bank.deploy(
      await miniDai.getAddress(),
      await oracle.getAddress(),
      owner.address,
      await bankToken.getAddress(),
      await aMDAI.getAddress()
    );
    await bank.waitForDeployment();

    await miniDai.setMinter(await bank.getAddress());
    await bankToken.transfer(await bank.getAddress(), ethers.parseUnits("200000", 18));
    await aMDAI.setBank(await bank.getAddress());

    const supplyAmount = ethers.parseEther("1000");
    await miniDai.mint(owner.address, supplyAmount);
    await miniDai.connect(owner).approve(await bank.getAddress(), supplyAmount);
    await bank.connect(owner).supply(supplyAmount);

    await bank.connect(user).depositCollateral({ value: ethers.parseEther("1") });
    await bank.connect(user).borrow(ethers.parseEther("800"));

    await ethers.provider.send("evm_increaseTime", [30]);
    await ethers.provider.send("evm_mine", []);
  });

  it("should split repay into principal, LP, and protocol correctly", async () => {
    const repayAmount = ethers.parseEther("50");

    await miniDai.mint(user.address, repayAmount);
    await miniDai.connect(user).approve(await bank.getAddress(), repayAmount);

    const tx = await bank.connect(user).repay(repayAmount);
    const receipt = await tx.wait();

    const event = receipt.logs.find(log => log.fragment?.name === "RepaidDetailed");
    expect(event).to.not.be.undefined;

    const [, burned, toLP, toProtocol] = event.args;

    console.log("\n🧾 還款拆分結果：");
    console.log("🔥 扣除本金    :", ethers.formatUnits(burned, 18), "mDAI");
    console.log("💧 給流動池    :", ethers.formatUnits(toLP, 18), "mDAI");
    console.log("🏦 給協議收入 :", ethers.formatUnits(toProtocol, 18), "mDAI");

    expect(burned).to.be.gt(0);
    expect(toLP).to.be.gt(0);
    expect(toProtocol).to.be.gt(0);

    const totalDebt = await bank.getTotalDebt(user.address);
    console.log("💳 使用者剩餘債務:", ethers.formatUnits(totalDebt, 18), "mDAI");

    expect(totalDebt).to.be.lt(ethers.parseEther("800"));
  });
});
