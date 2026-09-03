// SPDX-License-Identifier: MIT

let provider, signer, account;
let bankV3Contract, miniDaiContract, priceOracleContract;
let bankTokenContract, bankGovernorContract;
let aMDAIContract, bankTimelockContract;
let isConnecting = false, isProcessing = false, refreshTimerStarted = false;
const HARDHAT_CHAIN_ID = 31337n;
const DEBUG_UI = new URLSearchParams(window.location.search).get("debug") === "1";
if (!DEBUG_UI) console.log = () => {};

// 合約地址與 ABI
let bankV3Address, miniDaiAddress, priceOracleAddress;
let bankTokenAddress, governorAddress, aMDAIAddress, timelockAddress;

// === 錢包連接與合約載入 ===
  async function connectWallet() {
    if (isConnecting) return;
    isConnecting = true;
    try {
      if (!window.ethereum) return alert("請先安裝 MetaMask");
      await window.ethereum.request({ method: "eth_requestAccounts" });
      provider = new ethers.BrowserProvider(window.ethereum);
      await ensureHardhatNetwork();
      signer = await provider.getSigner();
      account = await signer.getAddress();
      document.getElementById("account").innerText = `已連接：${account}`;
      await loadContracts();
      await loadGovernanceContracts();
      await loadTimelockContract();
      await verifyDeployedContracts();

      await updateAll();

      // ✅ 定時每 10 秒同步資料
      if (!refreshTimerStarted) {
        setInterval(updateUnclaimedReward, 10000);
        setInterval(updateLPInfo, 10000);
        setInterval(updateWalletBalances, 10000);
        refreshTimerStarted = true;
      }

      // ✅ 可選：其他 update 也可以定期更新，例如利率、總儲量等
      // setInterval(updateRewardParams, 60000); // 每分鐘更新參數
    } catch (err) {
      alert("連接失敗: " + (err?.message || err?.reason || "未知錯誤"));
    } finally {
      isConnecting = false;
    }

    if (window.ethereum && !window.ethereum.__connectedOnce) {
      window.ethereum.on("accountsChanged", connectWallet);
      window.ethereum.on("chainChanged", () => window.location.reload());
      window.ethereum.__connectedOnce = true;
    }
  }
  async function ensureHardhatNetwork() {
    let network = await provider.getNetwork();
    if (network.chainId === HARDHAT_CHAIN_ID) {
      updateNetworkStatus(network.chainId);
      return;
    }

    updateNetworkStatus(network.chainId, true);

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x7a69" }],
      });
    } catch (switchErr) {
      if (switchErr.code !== 4902) {
        throw new Error("請將 MetaMask 切換到 Hardhat Localhost (chainId 31337)");
      }

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x7a69",
          chainName: "Hardhat Localhost",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["http://127.0.0.1:8545"],
        }],
      });
    }

    provider = new ethers.BrowserProvider(window.ethereum);
    network = await provider.getNetwork();

    if (network.chainId !== HARDHAT_CHAIN_ID) {
      throw new Error("目前 chainId 不是 31337，請確認 Hardhat node 是否啟動且 MetaMask 網路正確");
    }

    updateNetworkStatus(network.chainId);
  }
  function updateNetworkStatus(chainId, wrongNetwork = false) {
    const el = document.getElementById("networkStatus");
    if (!el) return;

    if (wrongNetwork) {
      el.innerHTML = `目前 chainId：${chainId.toString()}<br><span class="danger">請切換到 Hardhat Localhost 31337</span>`;
      return;
    }

    el.innerHTML = `網路：Hardhat Localhost<br>chainId：${chainId.toString()}`;
  }
  async function loadContracts() {
    const addresses = await fetch("contract-address.json").then(r => r.json());
    const [bankV3Art, miniArt, oracleArt, aMDAIArt] = await Promise.all([
      fetch("BankV3.json").then(r => r.json()),
      fetch("MiniDAI.json").then(r => r.json()),
      fetch("PriceOracle.json").then(r => r.json()),
      fetch("aMDAI.json").then(r => r.json())
    ]);
    bankV3Address = addresses.BankV3;
    miniDaiAddress = addresses.MiniDAI;
    priceOracleAddress = addresses.PriceOracle;
    aMDAIAddress = addresses.aMDAI;
    bankV3Contract = new ethers.Contract(bankV3Address, bankV3Art.abi, signer);
    miniDaiContract = new ethers.Contract(miniDaiAddress, miniArt.abi, signer);
    priceOracleContract = new ethers.Contract(priceOracleAddress, oracleArt.abi, signer);
    aMDAIContract = new ethers.Contract(aMDAIAddress, aMDAIArt.abi, signer);
  }
  async function loadGovernanceContracts() {
    const addresses = await fetch("contract-address.json").then(res => res.json());
    const tokenArtifact = await fetch("BankToken.json").then(res => res.json());
    const governorArtifact = await fetch("BankGovernor.json").then(res => res.json());
    bankTokenAddress = addresses.BankToken;
    governorAddress = addresses.BankGovernor;
    bankTokenContract = new ethers.Contract(bankTokenAddress, tokenArtifact.abi, signer);
    bankGovernorContract = new ethers.Contract(governorAddress, governorArtifact.abi, signer);
  }
  async function loadTimelockContract() {
    const addresses = await fetch("contract-address.json").then(res => res.json());
    const timelockArtifact = await fetch("BankTimelock.json").then(res => res.json());

    timelockAddress = addresses.BankTimelock;
    bankTimelockContract = new ethers.Contract(timelockAddress, timelockArtifact.abi, signer);

    console.log(" Timelock 合約已載入:", timelockAddress);
  }
  async function verifyDeployedContracts() {
    const network = await provider.getNetwork();
    console.log("Connected chainId:", network.chainId.toString());

    const addresses = {
      PriceOracle: priceOracleAddress,
      MiniDAI: miniDaiAddress,
      BankToken: bankTokenAddress,
      aMDAI: aMDAIAddress,
      BankV3: bankV3Address,
      BankTimelock: timelockAddress,
      BankGovernor: governorAddress,
    };

    for (const [name, address] of Object.entries(addresses)) {
      const code = address ? await provider.getCode(address) : "0x";
      console.log(`${name}: ${address || "missing address"} -> ${code === "0x" ? "no contract" : "contract exists"}`);
    }
  }
  async function safeAction(name, fn) {
    if (isProcessing) return alert("請等待前一筆交易完成");
    try {
      isProcessing = true;
      await fn();
      await updateAll();
    } catch (err) {
      alert(`${name} 失敗: ${err?.message || err?.reason || "未知錯誤"}`);
    } finally {
      isProcessing = false;
    }
  }

// === 資料更新區塊 ===
  async function updateAll() {
    await Promise.allSettled([
      updateWalletBalances(),
      updateETHPriceDisplay(),
      updateProtocolDashboard(),
      updateMarketView(),
      updateFullUserData(),
      updatePortfolioRiskPanel(),
      updateRiskModelView(),
      updateRewardParams(),
      updateLPInfo(),
      updateVotingInfo(),
      updateQuorumInfo(),
      updateGovernanceConsole(),
      updateParameterTable(),
      updateLiquidationWatchlist(),
      updateRecentActivity(),
      updateUnclaimedReward(),
    ]);
  }
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  }
  function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }
  function formatNumber(value, digits = 2) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return "--";
    return numberValue.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  function formatUnitsSafe(value, decimals = 18, digits = 2) {
    try {
      return formatNumber(ethers.formatUnits(value, decimals), digits);
    } catch {
      return "--";
    }
  }
  function formatEtherSafe(value, digits = 4) {
    try {
      return formatNumber(ethers.formatEther(value), digits);
    } catch {
      return "--";
    }
  }
  function formatPercentBps(value, digits = 2) {
    return `${(Number(value) / 100).toFixed(digits)}%`;
  }
  function shorten(addr) {
    return addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "--";
  }
  function healthStatusFromFactor(factor, liquidationThreshold = 10000n) {
    if (factor === ethers.MaxUint256) {
      return { label: "Infinity", status: "Safe", badge: "safe", width: 100, value: Infinity };
    }

    const value = Number(factor) / 1e4;
    const threshold = Number(liquidationThreshold) / 1e4;
    if (value < threshold) {
      return { label: value.toFixed(2), status: "Liquidatable", badge: "danger", width: Math.max(3, value * 50), value };
    }
    if (value < 1.2) {
      return { label: value.toFixed(2), status: "High Risk", badge: "danger", width: Math.min(100, value * 50), value };
    }
    if (value < 2) {
      return { label: value.toFixed(2), status: "Watch", badge: "watch", width: Math.min(100, value * 50), value };
    }
    return { label: value.toFixed(2), status: "Safe", badge: "safe", width: 100, value };
  }
  function renderTable(headers, rows) {
    return `
      <table class="data-table">
        <thead><tr>${headers.map(header => `<th>${header}</th>`).join("")}</tr></thead>
        <tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}">No data</td></tr>`}</tbody>
      </table>
    `;
  }
  async function updateWalletBalances() {
    const el = document.getElementById("tokenBalances");
    if (!el || !account || !provider || !miniDaiContract || !aMDAIContract || !bankTokenContract) return;

    try {
      const [eth, mDai, aMDAI, bkt] = await Promise.all([
        provider.getBalance(account),
        miniDaiContract.balanceOf(account),
        aMDAIContract.balanceOf(account),
        bankTokenContract.balanceOf(account),
      ]);

      el.innerHTML = `
        ETH：${Number(ethers.formatEther(eth)).toFixed(6)}<br>
        mDAI：${Number(ethers.formatUnits(mDai, 18)).toFixed(4)}<br>
        aMDAI：${Number(ethers.formatUnits(aMDAI, 18)).toFixed(4)}<br>
        BKT：${Number(ethers.formatUnits(bkt, 18)).toFixed(4)}
      `;
    } catch (err) {
      console.error("讀取錢包餘額失敗", err);
      el.innerText = "餘額讀取失敗，請確認網路與合約地址";
    }
  }
  async function updateLPInfo() {
    try {
      const balance = await aMDAIContract.balanceOf(account);
      const totalSupply = await aMDAIContract.totalSupply();
      const pool = await bankV3Contract.getTotalSupplied();
      // 查詢當前 aMDAI 兌換比
      const exchangeRate = await bankV3Contract.getExchangeRate(); // 單位是 1e18
      const exchangeRateFormatted = (Number(exchangeRate) / 1e18).toFixed(6);
      document.getElementById("lpInfo").innerHTML = `
        <h3> LP 狀態</h3>
         你的 aMDAI：${ethers.formatUnits(balance, 18)} 顆<br>
         aMDAIContract.totalSupply總供應量：${ethers.formatUnits(totalSupply, 18)} 顆<br>
         liquidityPool流動性池中 mDAI：${ethers.formatUnits(pool, 18)} 顆
         aMDAI 兌換比：${exchangeRateFormatted}<br>
      `;
    } catch (err) {
      console.error(" 讀取 LP 資訊失敗", err);
    }
  }
  async function updateETHPriceDisplay() {
    const price = await priceOracleContract.getLatestETHPrice();
    const priceValue = ethers.formatUnits(price, 8);
    document.getElementById("ethPriceNow").innerText = `目前價格：${Number(priceValue).toFixed(2)} USD / ETH`;
  }
  async function readProtocolMetrics() {
    const [
      ethPrice,
      totalCollateral,
      totalSupplied,
      totalDebt,
      utilization,
      tokenReserve,
      ethReserve,
      interestRate,
      reserveFactor,
      ltv,
      liquidationThreshold,
      bonusPercent,
      exchangeRate,
      dailyCap,
      distributedToday,
      maxTotalDebt,
    ] = await Promise.all([
      bankV3Contract.getCurrentETHPrice(),
      bankV3Contract.totalCollateral(),
      bankV3Contract.getTotalSupplied(),
      bankV3Contract.totalDebtCached(),
      bankV3Contract.getUtilizationRate(),
      bankV3Contract.getProtocolTokenReserve(),
      bankV3Contract.getProtocolETHReserve(),
      bankV3Contract.getInterestRate(),
      bankV3Contract.reserveFactor(),
      bankV3Contract.LTV(),
      bankV3Contract.LIQUIDATION_THRESHOLD(),
      bankV3Contract.BONUS_PERCENT(),
      bankV3Contract.getExchangeRate(),
      bankV3Contract.dailyCap(),
      bankV3Contract.distributedToday(),
      bankV3Contract.maxTotalDebt(),
    ]);

    const collateralUSD = Number(ethers.formatEther(totalCollateral)) * Number(ethers.formatUnits(ethPrice, 8));
    const suppliedUSD = Number(ethers.formatUnits(totalSupplied, 18));
    const debtUSD = Number(ethers.formatUnits(totalDebt, 18));
    const tokenReserveUSD = Number(ethers.formatUnits(tokenReserve, 18));
    const ethReserveUSD = Number(ethers.formatEther(ethReserve)) * Number(ethers.formatUnits(ethPrice, 8));
    const borrowApr = Number(interestRate) / 100;
    const utilizationRatio = Number(utilization) / 10000;
    const reserveRatio = Number(reserveFactor) / 10000;
    const supplyApr = borrowApr * utilizationRatio * (1 - reserveRatio);

    return {
      ethPrice,
      totalCollateral,
      totalSupplied,
      totalDebt,
      utilization,
      tokenReserve,
      ethReserve,
      interestRate,
      reserveFactor,
      ltv,
      liquidationThreshold,
      bonusPercent,
      exchangeRate,
      dailyCap,
      distributedToday,
      maxTotalDebt,
      collateralUSD,
      suppliedUSD,
      debtUSD,
      tokenReserveUSD,
      ethReserveUSD,
      tvlUSD: collateralUSD + suppliedUSD,
      borrowApr,
      supplyApr,
    };
  }
  async function updateProtocolDashboard() {
    if (!bankV3Contract) return;

    const metrics = await readProtocolMetrics();

    setText("metricTVL", `$${formatNumber(metrics.tvlUSD, 2)}`);
    setText("metricTotalSupplied", `${formatUnitsSafe(metrics.totalSupplied, 18, 2)} mDAI`);
    setText("metricTotalBorrowed", `${formatUnitsSafe(metrics.totalDebt, 18, 2)} mDAI`);
    setText("metricAvailableLiquidity", `${formatUnitsSafe(metrics.totalSupplied, 18, 2)} mDAI`);
    setText("metricUtilization", formatPercentBps(metrics.utilization));
    setText("metricProtocolReserve", `$${formatNumber(metrics.tokenReserveUSD + metrics.ethReserveUSD, 2)}`);
    setText("metricBorrowAPR", `${metrics.borrowApr.toFixed(2)}%`);
    setText("metricSupplyAPR", `${metrics.supplyApr.toFixed(2)}%`);
    setText("previewInterestBox", `Utilization ${formatPercentBps(metrics.utilization)} | Borrow APR ${metrics.borrowApr.toFixed(2)}% | Supply APR ${metrics.supplyApr.toFixed(2)}%`);

    setHTML("overviewMarketNote", `
      <strong>ETH Oracle Price:</strong> $${formatUnitsSafe(metrics.ethPrice, 8, 2)}<br>
      <strong>Total Collateral:</strong> ${formatEtherSafe(metrics.totalCollateral, 4)} ETH ($${formatNumber(metrics.collateralUSD, 2)})<br>
      <strong>mDAI Reserve:</strong> ${formatUnitsSafe(metrics.tokenReserve, 18, 2)} mDAI<br>
      <strong>ETH Reserve:</strong> ${formatEtherSafe(metrics.ethReserve, 6)} ETH<br>
      <strong>aMDAI Exchange Rate:</strong> ${formatUnitsSafe(metrics.exchangeRate, 18, 6)} mDAI / aMDAI
    `);
  }
  async function updateMarketView() {
    if (!bankV3Contract) return;

    const metrics = await readProtocolMetrics();
    const rows = [`
      <tr>
        <td><strong>ETH / mDAI</strong><br><span class="muted">Collateral: ETH<br>Borrow: mDAI</span></td>
        <td>${formatPercentBps(metrics.ltv)}</td>
        <td>${formatPercentBps(metrics.liquidationThreshold)}</td>
        <td>${formatPercentBps(metrics.bonusPercent)}</td>
        <td>${formatPercentBps(metrics.reserveFactor)}</td>
        <td>${metrics.borrowApr.toFixed(2)}%</td>
        <td>${metrics.supplyApr.toFixed(2)}%</td>
        <td>${formatPercentBps(metrics.utilization)}</td>
        <td>${formatUnitsSafe(metrics.totalSupplied, 18, 2)} mDAI</td>
      </tr>
    `];

    setHTML("marketTable", renderTable([
      "Market", "LTV", "Liquidation Threshold", "Liquidation Bonus", "Reserve Factor", "Borrow APR", "Supply APR", "Utilization", "Available Liquidity"
    ], rows));
  }
  async function updatePortfolioRiskPanel() {
    if (!account || !bankV3Contract) return;

    const [accountData, hf, liquidationThreshold, liquidationPrice, maxWithdraw, totalDebt] = await Promise.all([
      bankV3Contract.getUserAccountData(account),
      bankV3Contract.getHealthFactor(account),
      bankV3Contract.LIQUIDATION_THRESHOLD(),
      bankV3Contract.getLiquidationPrice(account),
      bankV3Contract.getMaxWithdrawableETH(account),
      bankV3Contract.getTotalDebt(account),
    ]);

    const health = healthStatusFromFactor(hf, liquidationThreshold);
    const priceLabel = liquidationPrice > 0n ? `$${formatUnitsSafe(liquidationPrice, 8, 2)}` : "No active debt";

    setText("healthFactorValue", health.label);
    setHTML("riskStatusValue", `<span class="badge ${health.badge}">${health.status}</span>`);
    setText("collateralValueUSD", `$${formatUnitsSafe(accountData[0], 18, 2)}`);
    setText("debtValueUSD", `$${formatUnitsSafe(totalDebt, 18, 2)}`);
    setText("availableBorrowValue", `$${formatUnitsSafe(accountData[2], 18, 2)}`);
    setText("liquidationPriceValue", priceLabel);
    setText("maxWithdrawableValue", `${formatEtherSafe(maxWithdraw, 6)} ETH`);

    const fill = document.getElementById("riskBarFill");
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, health.width))}%`;

    setHTML("overviewHealth", `
      <strong>Health Factor:</strong> ${health.label}<br>
      <strong>Status:</strong> <span class="badge ${health.badge}">${health.status}</span><br>
      <strong>Collateral Value:</strong> $${formatUnitsSafe(accountData[0], 18, 2)}<br>
      <strong>Debt:</strong> $${formatUnitsSafe(totalDebt, 18, 2)}<br>
      <strong>Available Borrow:</strong> $${formatUnitsSafe(accountData[2], 18, 2)}
    `);

    setHTML("accountRiskMatrix", `
      <strong>Liquidation trigger:</strong> current prototype liquidates when HF is below ${formatPercentBps(liquidationThreshold)}.<br>
      <strong>Liquidation price:</strong> ${priceLabel}<br>
      <strong>Max withdrawable collateral:</strong> ${formatEtherSafe(maxWithdraw, 6)} ETH<br>
      <strong>Interpretation:</strong> ${health.status}
    `);
  }
  async function updateRiskModelView() {
    if (!bankV3Contract) return;
    const metrics = await readProtocolMetrics();
    const rows = [
      ["LTV", formatPercentBps(metrics.ltv), "Maximum borrow capacity against ETH collateral"],
      ["Liquidation Threshold", formatPercentBps(metrics.liquidationThreshold), "Prototype threshold used by BankV3.getHealthFactor"],
      ["Liquidation Bonus", formatPercentBps(metrics.bonusPercent), "Extra collateral incentive paid to liquidators"],
      ["Reserve Factor", formatPercentBps(metrics.reserveFactor), "Interest/liquidation share retained by protocol reserve"],
      ["Max Liquidation Percent", "50.00%", "Maximum principal repayable per liquidation"],
      ["Oracle", "Mock PriceOracle", "Local/testnet price control for liquidation testing"],
    ].map(([name, value, note]) => `<tr><td><strong>${name}</strong></td><td>${value}</td><td>${note}</td></tr>`);

    setHTML("riskModelTable", renderTable(["Risk Parameter", "Current Value", "Meaning"], rows));
  }
  async function updateFullUserData() {
    if (!account) return;

    const network = await provider.getNetwork();
    const nativeBalance = await provider.getBalance(account);
    const ethBalance = parseFloat(ethers.formatEther(nativeBalance)).toFixed(6);

    const depositsWei = await bankV3Contract.collateral(account);
    const depositsETH = Number(ethers.formatEther(depositsWei));
    const ethPrice = await bankV3Contract.getCurrentETHPrice();
    const ethPriceUSD = Number(ethers.formatUnits(ethPrice, 8));
    const collateralUSD = (depositsETH * ethPriceUSD).toFixed(2);

    const [_, debt, availableToBorrow] = await bankV3Contract.getUserAccountData(account);
    const debtValue = Number(ethers.formatUnits(debt, 18)).toFixed(2);
    const availableValue = Number(ethers.formatUnits(availableToBorrow, 18)).toFixed(2);

    // 🔐 健康因子處理
    // 🔐 健康因子處理
      let healthFactor = "N/A";
      let healthFactorClass = "text-gray-400";

      try {
      const factor = await bankV3Contract.getHealthFactor(account);

      if (factor === ethers.MaxUint256) {
          healthFactor = `∞ 極安全`;
          healthFactorClass = "text-green-500";
      } else {
          const hfRaw = Number(factor); // HF 是 4-decimals 格式（×1e4）
          const hf = (hfRaw / 1e4).toFixed(2);
          const hfValue = parseFloat(hf);

          if (hfValue >= 2.0) {
          healthFactor = `${hf} ✅ 安全`;
          healthFactorClass = "text-green-500";
          } else if (hfValue >= 1.0) {
          healthFactor = `${hf} ⚠️ 注意`;
          healthFactorClass = "text-yellow-500";
          } else {
          healthFactor = `${hf} 🚨 危險`;
          healthFactorClass = "text-red-500";
          }
      }
      } catch (err) {
      console.warn("❌ Health Factor 讀取失敗", err);
      healthFactor = "錯誤 ❌";
      healthFactorClass = "text-red-500";
      }

    let maxWithdrawableETH = "查詢失敗";
    try {
      const maxWithdraw = await bankV3Contract.getMaxWithdrawableETH(account);
      maxWithdrawableETH = parseFloat(ethers.formatEther(maxWithdraw)).toFixed(6);
    } catch {}

    let principal = 0n, interest = 0n, interestRate = 0;
    let principalValue = "0.00", interestValue = "0.0000", interestRateValue = "0.00";
    let previewInterest = 0n;
    let previewInterestValue = "0.00000000";  // ✅ 加這行預設值
    let totalDebtValue = debtValue;

    try {
      [principal, interest] = await bankV3Contract.getUserDebt(account);
      interestRate = await bankV3Contract.getInterestRate();
      previewInterest = await bankV3Contract.previewInterest(account);

      principalValue = Number(ethers.formatUnits(principal, 18)).toFixed(2);
      interestValue = Number(ethers.formatUnits(interest, 18)).toFixed(8); // ✅ 改這裡
      previewInterestValue = Number(ethers.formatUnits(previewInterest, 18)).toFixed(8);
      interestRateValue = (Number(interestRate) / 100).toFixed(2);
      totalDebtValue = (Number(ethers.formatUnits(debt, 18)) + Number(ethers.formatUnits(interest, 18))).toFixed(6);

      console.log("🧪 利息更新：", interest.toString(), "→ $", interestValue);
    } catch {}

    let liquidationPrice = "無需清算";
    try {
      const price = await bankV3Contract.getLiquidationPrice(account);
      if (price > 0) liquidationPrice = `$${(Number(price) / 1e8).toFixed(2)} USD`;
    } catch {}

    let protocolTokenReserve = "載入中...";

    try {
      const tokenReserve = await bankV3Contract.getProtocolTokenReserve();
      const rawToken = ethers.formatUnits(tokenReserve, 18);
      protocolTokenReserve = Number(rawToken).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " mDAI";
    } catch (err) {
      console.error("取得儲備金失敗：", err);
    }

    const healthBadgeClass = healthFactorClass.includes("green")
      ? "safe"
      : healthFactorClass.includes("yellow")
        ? "watch"
        : "danger";

    document.getElementById("userInfo").innerHTML = `
      <strong>Wallet ETH:</strong> ${ethBalance} ETH<br>
      <strong>Collateral:</strong> ${depositsETH.toFixed(6)} ETH ($${collateralUSD})<br>
      <strong>Principal Debt:</strong> $${debtValue} mDAI<br>
      <strong>Accrued Interest:</strong> $${interestValue} mDAI at ${interestRateValue}% APR<br>
      <strong>Total Debt:</strong> $${totalDebtValue} mDAI<br>
      <strong>Available Borrow:</strong> $${availableValue} mDAI<br>
      <strong>Health Factor:</strong> <span class="badge ${healthBadgeClass}">${healthFactor}</span><br>
      <strong>Max Withdrawable:</strong> ${maxWithdrawableETH} ETH<br>
      <strong>Liquidation Price:</strong> ${liquidationPrice}<br>
      <strong>Protocol mDAI Reserve:</strong> ${protocolTokenReserve}
    `;
  }

  //  自動從 CollateralDeposited 事件取得歷史抵押用戶地址
  async function getActiveUsersFromEvents() {
    const filter = bankV3Contract.filters.CollateralDeposited();
    const events = await bankV3Contract.queryFilter(filter, 0, "latest");

    // 取出所有曾經抵押的 address（去重）
    const addresses = [...new Set(events.map(e => e.args.user))];
    return addresses;
  }

  async function fetchLiquidatableUsers() {
    await updateLiquidationWatchlist();
  }
  async function updateLiquidationWatchlist() {
    const tableEl = document.getElementById("liquidationWatchlist");
    if (!tableEl || !bankV3Contract) return;

    tableEl.innerHTML = "讀取清算監控資料中...";

    try {
      const [threshold, users] = await Promise.all([
        bankV3Contract.LIQUIDATION_THRESHOLD(),
        getActiveUsersFromEvents(),
      ]);

      const rows = [];
      for (const user of users) {
        try {
          const [hf, debt, collateralWei, liquidationPrice, maxRepay] = await Promise.all([
            bankV3Contract.getHealthFactor(user),
            bankV3Contract.getTotalDebt(user),
            bankV3Contract.collateral(user),
            bankV3Contract.getLiquidationPrice(user),
            bankV3Contract.estimateMaxLiquidate(user),
          ]);

          if (collateralWei === 0n && debt === 0n) continue;

          const health = healthStatusFromFactor(hf, threshold);
          const liquidationPriceLabel = liquidationPrice > 0n ? `$${formatUnitsSafe(liquidationPrice, 8, 2)}` : "--";
          const maxRepayLabel = formatUnitsSafe(maxRepay, 18, 4);

          rows.push(`
            <tr>
              <td><span class="mono">${shorten(user)}</span><br><span class="muted mono">${user}</span></td>
              <td>${formatEtherSafe(collateralWei, 6)} ETH</td>
              <td>${formatUnitsSafe(debt, 18, 4)} mDAI</td>
              <td>${health.label}</td>
              <td>${liquidationPriceLabel}</td>
              <td>${maxRepayLabel} mDAI</td>
              <td><span class="badge ${health.badge}">${health.status}</span></td>
              <td><button onclick="prepareLiquidation('${user}', '${ethers.formatUnits(maxRepay, 18)}')">Use</button></td>
            </tr>
          `);
        } catch (e) {
          console.warn(`查詢 ${user} 清算資料失敗`, e);
        }
      }

      setHTML("liquidationWatchlist", renderTable([
        "Account", "Collateral", "Debt", "Health Factor", "Liquidation Price", "Max Repay", "Status", "Action"
      ], rows));

      const liquidatableCount = rows.filter(row => row.includes("Liquidatable")).length;
      setHTML("liquidatableList", liquidatableCount ? `<li>${liquidatableCount} liquidatable account(s)</li>` : "<li>No liquidatable accounts</li>");
    } catch (err) {
      console.error("清算監控資料讀取失敗", err);
      tableEl.innerHTML = "讀取失敗，請確認合約已部署且本地節點正在執行";
    }
  }
  function prepareLiquidation(user, amount) {
    setText("maxRepayHint", `Selected ${shorten(user)} | max repay ${formatNumber(amount, 6)} mDAI`);
    const userInput = document.getElementById("liquidateUser");
    const amountInput = document.getElementById("liquidateAmount");
    if (userInput) userInput.value = user;
    if (amountInput) amountInput.value = amount;
  }

  async function fetchProposalList() {
    const proposalListEl = document.getElementById("proposalList");
    if (!proposalListEl) return;

    const filter = bankGovernorContract.filters.ProposalCreated();
    const events = await bankGovernorContract.queryFilter(filter);

    // 解析所有 calldata 的 function signature
    const iface = new ethers.Interface([
      "function setInterestRate(uint256)",
      "function setDailyCap(uint256)",
      "function withdrawETHReserve(address,uint256)",
      "function setGovernance(address)",
      "function setProposalThreshold(uint256)",
      "function setQuorumPercent(uint256)",
      "function injectProtocolEarningsToLP(uint256)",
      "function setRewardRatio(uint256)",
      "function setLPRewardRatio(uint256)",
      "function setBorrowerRewardRatio(uint256)",
      "function setReserveFactor(uint256)",
      "function lockGovernance()"
    ]);

    const items = await Promise.all(events.map(async (e) => {
      const id = e.args.proposalId;
      const proposer = e.args.proposer;
      const desc = e.args.description;
      const stateNum = await bankGovernorContract.state(id);
      const stateName = getProposalStateName(stateNum);

      // 處理每一筆 call
      let calls = "";
      for (let i = 0; i < e.args.targets.length; i++) {
        const target = e.args.targets[i];
        const calldata = e.args.calldatas[i];

        let decoded = "";
        let fnName = "";
        try {
          const parsed = iface.parseTransaction({ data: calldata });
          fnName = parsed.name;
          decoded = parsed.args.map(arg => arg.toString()).join(", ");
        } catch (err) {
          fnName = "⚠️ 無法辨識";
          decoded = "⚠️ 無法解碼";
        }

        calls += `<li>📦 ${shorten(target)} → <code>${fnName}(...)</code><br>🧬 Args: ${decoded}</li>`;
      }

      return `<li style="margin-bottom: 1em;">
        🔹 <strong>${stateName}</strong>｜🆔 <code>#${id}</code><br>
        🙋‍♂️ 提案人：${shorten(proposer)}<br>
        📝 ${desc}
        <ul>${calls}</ul>
      </li>`;
    }));

    proposalListEl.innerHTML = items.reverse().join("\n");
  }

  // 將狀態數值轉換為文字
  function shorten(addr) {
    return addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "--";
  }
  function getProposalStateName(state) {
    const states = [
      "Pending", "Active", "Canceled", "Defeated",
      "Succeeded", "Queued", "Expired", "Executed"
    ];
    return states[state] || "Unknown";
  }


  async function updateVotingInfo() {
      if (!bankTokenContract || !bankGovernorContract || !account) return;
      const balance = await bankTokenContract.balanceOf(account);
      const votes = await bankTokenContract.getVotes(account);
      const threshold = await bankGovernorContract.proposalThreshold();
      const canPropose = votes >= threshold;
      document.getElementById("votingInfo").innerHTML = `
      <h3>🧠 DAO 投票資訊</h3>
      BankToken 餘額：${ethers.formatUnits(balance, 18)} BKT<br>
      擁有投票權：${ethers.formatUnits(votes, 18)} BKT<br>
      提案門檻：${ethers.formatUnits(threshold, 18)} BKT<br>
      ${canPropose ? "✅ 可發起提案" : "❌ 無法發起提案"}
      `;
  }
  async function updateQuorumInfo() {
    const blockNumber = await provider.getBlockNumber();
    const lastBlock = blockNumber - 1;
    const totalVotes = await bankGovernorContract.quorum(lastBlock);

    const formatted = Math.round(Number(ethers.formatUnits(totalVotes, 18))).toLocaleString();

    document.getElementById("quorumInfo").innerHTML = `
      🧾 提案有效門檻：至少 ${formatted} 票
    `;
  }
  async function updateGovernanceConsole() {
    if (!bankGovernorContract || !bankTokenContract || !bankV3Contract || !account) return;

    const latestBlock = await provider.getBlockNumber();
    const quorumBlock = latestBlock > 0 ? latestBlock - 1 : 0;
    const [
      proposalThreshold,
      quorumPercent,
      votingDelay,
      votingPeriod,
      quorumVotes,
      tokenSupply,
      governanceAddress,
    ] = await Promise.all([
      bankGovernorContract.proposalThreshold(),
      bankGovernorContract.quorumPercent(),
      bankGovernorContract.votingDelay(),
      bankGovernorContract.votingPeriod(),
      bankGovernorContract.quorum(quorumBlock),
      bankTokenContract.totalSupply(),
      bankV3Contract.governance(),
    ]);

    let minDelay = "--";
    try {
      minDelay = `${(await bankTimelockContract.getMinDelay()).toString()} seconds`;
    } catch {}

    setHTML("governanceOverview", `
      <strong>Governor:</strong> <span class="mono">${governorAddress}</span><br>
      <strong>Timelock:</strong> <span class="mono">${timelockAddress}</span><br>
      <strong>BankV3 governance:</strong> <span class="mono">${governanceAddress}</span><br>
      <strong>Proposal threshold:</strong> ${formatUnitsSafe(proposalThreshold, 18, 4)} BKT<br>
      <strong>Quorum setting:</strong> ${quorumPercent.toString()}% (${formatUnitsSafe(quorumVotes, 18, 4)} BKT at block ${quorumBlock})<br>
      <strong>Voting delay / period:</strong> ${votingDelay.toString()} / ${votingPeriod.toString()} blocks<br>
      <strong>Timelock delay:</strong> ${minDelay}<br>
      <strong>BKT total supply:</strong> ${formatUnitsSafe(tokenSupply, 18, 2)} BKT
    `);
  }
  async function updateParameterTable() {
    if (!bankV3Contract || !bankGovernorContract) return;

    const metrics = await readProtocolMetrics();
    const [lpRatio, borrowerRatio, rewardRatio, proposalThreshold, quorumPercent] = await Promise.all([
      bankV3Contract.lpRewardRatio(),
      bankV3Contract.borrowerRewardRatio(),
      bankV3Contract.rewardRatio(),
      bankGovernorContract.proposalThreshold(),
      bankGovernorContract.quorumPercent(),
    ]);

    const remainingDailyRewards = metrics.dailyCap > metrics.distributedToday ? metrics.dailyCap - metrics.distributedToday : 0n;
    const rows = [
      ["Interest Rate", `${metrics.borrowApr.toFixed(2)}%`, "BankV3", "setInterestRate(uint256)", "Yes"],
      ["LTV", formatPercentBps(metrics.ltv), "BankV3", "Not currently mutable", "No"],
      ["Liquidation Threshold", formatPercentBps(metrics.liquidationThreshold), "BankV3", "Not currently mutable", "No"],
      ["Liquidation Bonus", formatPercentBps(metrics.bonusPercent), "BankV3", "Not currently mutable", "No"],
      ["Reserve Factor", formatPercentBps(metrics.reserveFactor), "BankV3", "setReserveFactor(uint256)", "Yes"],
      ["Max Total Debt", `${formatUnitsSafe(metrics.maxTotalDebt, 18, 0)} mDAI`, "BankV3", "setMaxTotalDebt(uint256)", "Yes"],
      ["Daily Cap", `${formatUnitsSafe(metrics.dailyCap, 18, 2)} BKT`, "BankV3", "setDailyCap(uint256)", "Yes"],
      ["Remaining Daily Rewards", `${formatUnitsSafe(remainingDailyRewards, 18, 2)} BKT`, "BankV3", "derived", "No"],
      ["LP Reward Ratio", lpRatio.toString(), "BankV3", "setLPRewardRatio(uint256)", "Yes"],
      ["Borrower Reward Ratio", borrowerRatio.toString(), "BankV3", "setBorrowerRewardRatio(uint256)", "Yes"],
      ["Legacy rewardRatio", rewardRatio.toString(), "BankV3", "setRewardRatio(uint256)", "Yes"],
      ["Proposal Threshold", `${formatUnitsSafe(proposalThreshold, 18, 4)} BKT`, "Governor", "setProposalThreshold(uint256)", "Yes"],
      ["Quorum Percent", quorumPercent.toString(), "Governor", "setQuorumPercent(uint256)", "Yes"],
    ].map(([parameter, value, contractName, functionName, controlled]) => `
      <tr>
        <td><strong>${parameter}</strong></td>
        <td>${value}</td>
        <td>${contractName}</td>
        <td><span class="mono">${functionName}</span></td>
        <td><span class="badge ${controlled === "Yes" ? "safe" : "neutral"}">${controlled}</span></td>
      </tr>
    `);

    setHTML("parameterTable", renderTable(["Parameter", "Current Value", "Contract", "Function", "Governance Controlled"], rows));
  }
  async function updateRewardParams() {
    console.log("✅ 自動更新獎勳觸發！");

    if (!bankV3Contract) return;

    const [lpRatio, borrowerRatio, cap, reserve] = await Promise.all([
      bankV3Contract.lpRewardRatio(),
      bankV3Contract.borrowerRewardRatio(),
      bankV3Contract.dailyCap(),
      bankV3Contract.reserveFactor(),
    ]);

    const lpRatioFormatted = ethers.formatUnits(lpRatio, 18);           // 每秒每 USD 發幣 (LP)
    const borrowerRatioFormatted = ethers.formatUnits(borrowerRatio, 18); // 每秒每 USD 發幣 (Borrower)
    const capFormatted = ethers.formatUnits(cap, 18);                   // 每日發幣上限
    const reservePercent = (Number(reserve) / 10000 * 100).toFixed(1);  // % 顯示

    const distributed = await bankV3Contract.distributedToday();
    const remaining = cap > distributed ? cap - distributed : 0n;

    document.getElementById("rewardInfo").innerHTML = `
      <strong>LP emission:</strong> ${lpRatioFormatted} BKT per second per USD<br>
      <strong>Borrower emission:</strong> ${borrowerRatioFormatted} BKT per second per USD<br>
      <strong>Daily cap:</strong> ${capFormatted} BKT<br>
      <strong>Distributed today:</strong> ${ethers.formatUnits(distributed, 18)} BKT<br>
      <strong>Remaining budget:</strong> ${ethers.formatUnits(remaining, 18)} BKT<br>
      <strong>Reserve Factor:</strong> ${reservePercent}%
    `;
  }
  async function updateUnclaimedReward() {
    if (!account || !bankV3Contract) return;

    try {
      const [lp, borrower] = await Promise.all([
        bankV3Contract.getPendingReward(account, true),   // 👈 改這行
        bankV3Contract.getPendingReward(account, false),  // 👈 改這行
      ]);

      const [lpCapped, borrowerCapped] = await Promise.all([
        bankV3Contract.getRewardPreviewCapped(account, true),
        bankV3Contract.getRewardPreviewCapped(account, false),
      ]);
      const [cap, todayDistributed] = await Promise.all([
        bankV3Contract.dailyCap(),
        bankV3Contract.distributedToday(),
      ]);

      document.getElementById("unclaimedLP").innerText =
        `${ethers.formatUnits(lp, 18)} BKT（可領：${ethers.formatUnits(lpCapped, 18)}）`;
      document.getElementById("unclaimedBorrower").innerText =
        `${ethers.formatUnits(borrower, 18)} BKT（可領：${ethers.formatUnits(borrowerCapped, 18)}）`;

      // 顯示發幣上限提示
      document.getElementById("errorBox").innerText =
        todayDistributed >= cap ? "⚠️ 今日已達每日發幣上限，請明日再領取" : "";
    } catch (err) {
      console.error("❌ 查詢失敗", err);
      document.getElementById("unclaimedLP").innerText = "查詢失敗 ❌";
      document.getElementById("unclaimedBorrower").innerText = "查詢失敗 ❌";
      document.getElementById("errorBox").innerText = " 查詢獎勵資料時發生錯誤";
    }
  }
  async function updateRecentActivity() {
    const activityEl = document.getElementById("recentActivity");
    if (!activityEl || !bankV3Contract || !provider) return;

    activityEl.innerHTML = "讀取近期事件中...";

    const eventNames = [
      "CollateralDeposited",
      "CollateralWithdrawn",
      "Borrowed",
      "RepaidDetailed",
      "Liquidated",
      "Supplied",
      "Redeemed",
      "RewardClaimed",
      "GovernanceTransferred",
    ];

    try {
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latest - 5000);
      const eventGroups = await Promise.all(eventNames.map(async (name) => {
        try {
          return await bankV3Contract.queryFilter(bankV3Contract.filters[name](), fromBlock, "latest");
        } catch (err) {
          console.warn(`讀取 ${name} 事件失敗`, err);
          return [];
        }
      }));

      const events = eventGroups.flat().sort((a, b) => {
        if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
        return (b.index || 0) - (a.index || 0);
      }).slice(0, 30);

      const rows = events.map((event) => {
        const name = event.fragment?.name || event.eventName || "Event";
        const args = event.args || {};
        const accountValue = args.user || args.liquidator || args.recipient || args.oldGov || "--";
        const amountValue = args.amount || args.miniDAIAmount || args.seizedCollateral || args.burned || args.shares || 0n;
        const amountLabel = typeof amountValue === "bigint" ? formatUnitsSafe(amountValue, 18, 6) : amountValue.toString();
        const details = formatEventDetails(name, args);

        return `
          <tr>
            <td>${event.blockNumber}</td>
            <td><strong>${name}</strong></td>
            <td><span class="mono">${typeof accountValue === "string" && accountValue.startsWith("0x") ? shorten(accountValue) : accountValue}</span></td>
            <td>${amountLabel}</td>
            <td>${details}</td>
          </tr>
        `;
      });

      setHTML("recentActivity", renderTable(["Block", "Event", "Account", "Amount", "Details"], rows));
    } catch (err) {
      console.error("讀取近期活動失敗", err);
      activityEl.innerHTML = "讀取近期活動失敗，請確認本地節點與合約事件可讀取";
    }
  }
  function formatEventDetails(name, args) {
    if (name === "RepaidDetailed") {
      return `burned ${formatUnitsSafe(args.burned, 18, 4)} | LP ${formatUnitsSafe(args.toLP, 18, 4)} | reserve ${formatUnitsSafe(args.toProtocol, 18, 4)}`;
    }
    if (name === "Liquidated") {
      return `borrower ${shorten(args.user)} | seized ${formatEtherSafe(args.seizedCollateral, 6)} ETH`;
    }
    if (name === "Supplied") {
      return `shares ${formatUnitsSafe(args.shares, 18, 4)} aMDAI`;
    }
    if (name === "Redeemed") {
      return `shares burned ${formatUnitsSafe(args.shares, 18, 4)} aMDAI`;
    }
    if (name === "GovernanceTransferred") {
      return `${shorten(args.oldGov)} -> ${shorten(args.newGov)}`;
    }
    return "--";
  }



// === 借貸與抵押功能 ===
  async function depositETH() {
    await safeAction("存入 ETH", async () => {
      const amount = document.getElementById("depositAmount").value;
      if (!amount || isNaN(amount)) throw new Error("請輸入正確的數量");
      const tx = await bankV3Contract.depositCollateral({ value: ethers.parseEther(amount) });
      await tx.wait();
    });
  }
  async function borrow() {
    const amount = document.getElementById("borrowAmount").value;
    const parsedAmount = ethers.parseUnits(amount, 18);

    console.log("📊 Debug 借款前資料");

    const userDebt = await bankV3Contract.getUserDebt(account);
    const collateralValue = await bankV3Contract.getCollateralValueUSD(account);
    const ethPrice = await bankV3Contract.getCurrentETHPrice();
    const LTV = await bankV3Contract.LTV();
    const liquidity = await bankV3Contract.getTotalSupplied();
    const accountData = await bankV3Contract.getUserAccountData(account);
    const collateralUSD = accountData[0];
    const currentDebt = accountData[1];
    const maxBorrow = accountData[2];

    console.log("🧾 借款 Debug 資訊開始");
    console.log("你要借 parsedAmount:", ethers.formatUnits(parsedAmount, 18), "mDAI");
    console.log("你目前本金 userDebt.principal:", ethers.formatUnits(userDebt[0], 18), "mDAI");
    console.log("你目前利息 userDebt.interest:", ethers.formatUnits(userDebt[1], 18), "mDAI");
    console.log("你目前抵押品價值 (USD):", ethers.formatUnits(collateralUSD, 18));
    console.log("你目前債務總額 (USD):", ethers.formatUnits(currentDebt, 18));
    console.log("你最多可以借 maxBorrow:", ethers.formatUnits(maxBorrow, 18), "mDAI");
    console.log("ETH 價格 (USD):", Number(ethPrice) / 1e8);
    console.log("LTV 限制:", LTV);
    console.log("流動性池餘額:", ethers.formatUnits(liquidity, 18), "mDAI");
    console.log("🧾 借款 Debug 資訊結束");

    await safeAction("借出 mDAI", async () => {
      const tx = await bankV3Contract.borrow(parsedAmount);
      await tx.wait();
    });
  }
  async function repay() {
    await safeAction("償還 mDAI", async () => {
      const amount = ethers.parseUnits(document.getElementById("repayAmount").value, 18);
      await miniDaiContract.approve(bankV3Address, amount);
      const tx = await bankV3Contract.repay(amount);
      await tx.wait();
    });
  }
  async function repayAll() {
    await safeAction("一鍵還清", async () => {
      const [principal, interest] = await bankV3Contract.getUserDebt(account);

      const totalDebt = principal + interest;
      if (totalDebt === 0n) {
        return alert("✅ 你已無債務");
      }

      // 加入 buffer 防止 dust
      const buffer = ethers.parseUnits("0.01", 18); // 可調整
      const total = totalDebt + buffer;

      // ✅ 先 approve 再 repay
      await miniDaiContract.approve(bankV3Address, total);
      const tx = await bankV3Contract.repay(total);
      await tx.wait();

      alert("✅ 成功一次還清！（含少量 buffer）");
    });
  }
  async function withdrawCollateral() {
    await safeAction("提取 ETH", async () => {
      let amount = ethers.parseEther(document.getElementById("withdrawAmount").value);
      if (amount > 1n) amount -= 1n;
      const tx = await bankV3Contract.withdrawCollateral(amount);
      await tx.wait();
    });
  }

// === 清算功能 ===
  /*async function estimateMaxLiquidateUI() {
    const user = document.getElementById("liquidateUser").value;
    if (!user) return alert("請輸入清算對象地址");

    try {
      const maxRepay = await bankV3Contract.estimateMaxLiquidate(user);

      // ✅ 格式化為 mDAI 數值（保留 6 位小數）
      const formatted = Number(ethers.formatUnits(maxRepay, 18)).toFixed(6);

      // ✅ 填入 input 欄位
      document.getElementById("liquidateAmount").value = maxRepay.toString(); // 合約呼叫用 raw
      document.getElementById("maxRepayHint").innerText = `💡 建議最大清償額度：約 ${formatted} mDAI`;
    } catch (err) {
      console.error("❌ 估算清償額度失敗", err);
      alert("估算失敗，請確認地址是否正確或用戶是否可清算");
    }
  }*/
 async function estimateMaxLiquidateUI() {
  const user = document.getElementById("liquidateUser").value;
  if (!user) return alert("請輸入清算對象地址");

  try {
    const maxRepay = await bankV3Contract.estimateMaxLiquidate(user);
    const formatted = Number(ethers.formatUnits(maxRepay, 18)).toFixed(6);
    document.getElementById("liquidateAmount").value = formatted;
    document.getElementById("maxRepayHint").innerText = `建議最大清償額度：約 ${formatted} mDAI`;

    // 🔍 抓價格、參數
    const ethPriceRaw = await priceOracleContract.getLatestETHPrice(); // 8 decimals
    const ethPrice = Number(ethers.formatUnits(ethPriceRaw, 8));

    const reserveFactorRaw = await bankV3Contract.reserveFactor();
    const reserveFactor = Number(reserveFactorRaw.toString());

    const bonusPercentRaw = await bankV3Contract.BONUS_PERCENT();
    const bonusPercent = Number(bonusPercentRaw.toString());

    // 📐 清算報酬計算
    const DECIMALS = 10000;
    const rawRepay = Number(ethers.formatUnits(maxRepay, 18));
    const effectiveRepay = rawRepay * (1 - reserveFactor / DECIMALS);
    const rewardUSD = effectiveRepay * (bonusPercent + DECIMALS) / DECIMALS;
    const seizedETH = rewardUSD / ethPrice;

    alert(`預估可取得抵押品：約 ${seizedETH.toFixed(6)} ETH\nOracle 價格：${ethPrice} USD/ETH\n協議抽成：${(reserveFactor / 100).toFixed(2)}%\n清算獎勵：${(bonusPercent / 100).toFixed(2)}%`);
  } catch (err) {
    console.error(" 估算清償額度失敗", err);
    alert("估算失敗，請確認地址是否正確或用戶是否可清算");
  }
}
  async function liquidateUser() {
    await safeAction("清算", async () => {
      const user = document.getElementById("liquidateUser").value;
      const amountRaw = document.getElementById("liquidateAmount").value;
      if (!user || !amountRaw) return alert("請輸入完整資訊");

      const amount = ethers.parseUnits(amountRaw, 18);
      await miniDaiContract.approve(bankV3Address, amount);

      const tx = await bankV3Contract.liquidate(user, amount);
      const receipt = await tx.wait();

      let burnedStr = "0";
      let toLPStr = "0";
      let protocolStr = "0";
      let seizedStr = "0";

      for (const log of receipt.logs) {
        try {
          const parsed = bankV3Contract.interface.parseLog(log);
          if (parsed.name === "RepaidDetailed") {
            burnedStr = parsed.args.burned.toString();
            toLPStr = parsed.args.toLP.toString();
            protocolStr = parsed.args.toProtocol.toString();
          }
          if (parsed.name === "Liquidated") {
            seizedStr = parsed.args.seizedCollateral.toString();
          }
        } catch (e) {}
      }

      const burnedFinal = Number(ethers.formatUnits(burnedStr, 18)).toFixed(6);
      const toLPFinal = Number(ethers.formatUnits(toLPStr, 18)).toFixed(6);
      const protocolFinal = Number(ethers.formatUnits(protocolStr, 18)).toFixed(6);
      const seizedFinal = Number(ethers.formatUnits(seizedStr, 18)).toFixed(6);

      alert(
        ` 成功清算 ${user}\n` +
        ` 燒掉本金：${burnedFinal} mDAI\n` +
        ` 分配給 LP：${toLPFinal} mDAI\n` +
        ` 協議 reserve：${protocolFinal} mDAI\n` +
        ` 清算人取得：${seizedFinal} ETH`
      );
    });
  }
  async function claimRewardBorrower() {
    try {
      const tx = await bankV3Contract.claimReward(false); // 借款人
      await tx.wait();
      alert(" 成功領取借款人獎勳！");
    } catch (err) {
      console.error("❌ 領取失敗：", err);
      alert("❌ 領取失敗：" + (err?.reason || err?.message));
    }
  }
  async function claimRewardLP() {
    try {
      const tx = await bankV3Contract.claimReward(true); // LP
      await tx.wait();
      alert(" 成功領取 LP 獎勳！");
    } catch (err) {
      console.error("❌ 領取失敗：", err);
      alert("❌ 領取失敗：" + (err?.reason || err?.message));
    }
  }


// === 價格模擬功能 ===
  async function simulatePriceChange() {
    await safeAction("模擬價格變動", async () => {
      const input = parseFloat(document.getElementById("ethPriceInput").value);
      const tx = await priceOracleContract.setPrice(BigInt(Math.floor(input * 1e8)));
      await tx.wait();
    });
  }


// === DAO 治理功能 ===
//查詢操作
  async function checkProposalState() {
    const idRaw = document.getElementById("statusProposalId_state").value;
    if (!idRaw) return alert("請輸入提案 ID");

    let proposalId;
    try {
      proposalId = BigInt(idRaw);
    } catch {
      return alert("提案 ID 格式錯誤");
    }

    try {
      const state = await bankGovernorContract.state(proposalId);
      const stateMap = {
        0n: "0 - Pending ⏳（尚未開始投票）",
        1n: "1 - Active 🗳️（可投票）",
        2n: "2 - Canceled ❌（已取消）",
        3n: "3 - Defeated 🚫（未通過）",
        4n: "4 - Succeeded ✅（已通過，可排程）",
        5n: "5 - Queued ⏱️（已排程，可執行）",
        6n: "6 - Expired ⌛（逾時未執行）",
        7n: "7 - Executed 🏁（已執行）"
      };

      document.getElementById("proposalStatusResult").innerText =
        "📋 提案狀態：" + (stateMap[state] || `${state} - 未知狀態`);
    } catch (err) {
      console.error("查詢提案狀態錯誤：", err);
      alert("查詢失敗：" + (err.message || "未知錯誤"));
    }
  }
  async function checkProposalVotes() {
    const proposalIdRaw = document.getElementById("statusProposalId_votes").value;
    if (!proposalIdRaw) return alert("請輸入提案 ID");

    let proposalId;
    try {
      proposalId = BigInt(proposalIdRaw);
    } catch {
      return alert("提案 ID 格式錯誤");
    }

    try {
      const snapshot = await bankGovernorContract.proposalSnapshot(proposalId);
      const quorum = await bankGovernorContract.quorum(snapshot);
      const votes = await bankGovernorContract.proposalVotes(proposalId);

      const result = `
          📊 提案票數統計：
          ✅ 支持：${ethers.formatUnits(votes[1], 18)} 票
          ❌ 反對：${ethers.formatUnits(votes[0], 18)} 票
          🤷 棄權：${ethers.formatUnits(votes[2], 18)} 票
          🧾 有效門檻：${ethers.formatUnits(quorum, 18)} 票
      `;
      document.getElementById("proposalVotesResult").innerText = result;
    } catch (err) {
      console.error("❌ 查詢票數失敗", err);
      alert("查詢失敗：" + (err.message || "未知錯誤"));
    }
  }
  async function fetchProposals() {
    const filter = bankGovernorContract.filters.ProposalCreated();
    const events = await bankGovernorContract.queryFilter(filter, 0, "latest");

    // 先取得每個提案的詳細資料
    const proposals = await Promise.all(events.map(async (e) => {
      const id = e.args.id;
      const state = await bankGovernorContract.state(id);
      return {
        id: id.toString(),
        proposer: e.args.proposer,
        desc: e.args.description,
        start: e.args.startBlock,
        end: e.args.endBlock,
        state: state.toString()
      };
    }));

    // 🔧 排序：讓提案 ID 較大的排前面（通常是最新）
    proposals.sort((a, b) => Number(b.id) - Number(a.id));

    const stateMap = {
      "0": "⏳ Pending",
      "1": "🗳️ Active",
      "2": "❌ Canceled",
      "3": "🚫 Defeated",
      "4": "✅ Succeeded",
      "5": "⏱️ Queued",
      "6": "⌛ Expired",
      "7": "🏁 Executed"
    };

    const listHTML = proposals.map(p => `
      <li>
        <strong>#${p.id}</strong> by ${p.proposer}<br>
        📄 ${p.desc}<br>
        🕒 區塊：${p.start} ~ ${p.end}<br>
        📋 狀態：${stateMap[p.state] || p.state}
        <br><button onclick="castVoteOn(${p.id})">投票</button>
      </li>
    `).join("");

    document.getElementById("proposalList").innerHTML = `<ul>${listHTML}</ul>`;
  }
  function castVoteOn(proposalId) {
    document.getElementById("proposalId").value = proposalId;
    alert(`已填入 Proposal ID：${proposalId}，請選擇投票選項後點擊投票`);
  }
  async function castVote() {
    const proposalIdStr = document.getElementById("proposalId").value;
    const voteType = parseInt(document.getElementById("voteType").value);

    if (!proposalIdStr || isNaN(voteType)) {
      return alert("請輸入有效的提案 ID 與投票選項");
    }

    let proposalId;
    try {
      proposalId = BigInt(proposalIdStr);
    } catch {
      return alert("❌ 提案 ID 格式錯誤");
    }

    try {
      // ✅ 印出執行前環境資訊
      console.log("🏛️ Governor Contract Address:", await bankGovernorContract.getAddress());
      console.log(" 提案 ID:", proposalId.toString());
      const state = await bankGovernorContract.state(proposalId);
      console.log(" 提案狀態:", state);
      const votingPower = await bankTokenContract.getVotes(account);
      console.log(" Voting Power:", ethers.formatUnits(votingPower, 18));
      console.log(" 當前帳號:", account);
      const totalSupply = await bankTokenContract.totalSupply();
      console.log(" Token TotalSupply:", ethers.formatUnits(totalSupply, 18));

      if (Number(state) !== 1) {
        return alert("❌ 此提案不在投票階段（Active），目前狀態：" + Number(state));
      }

      if (votingPower === 0n) {
        return alert("❌ 你沒有投票權，請先委託 delegate()");
      }

      console.log("📨 正在提交投票：", { proposalId: proposalIdStr, voteType });

      const tx = await bankGovernorContract.castVote(proposalId, voteType);
      await tx.wait();

      alert(" 投票完成！");
    } catch (err) {
      console.error("❌ 投票失敗", err);
      const reason = err?.info?.error?.message || err?.reason || err?.message || "未知錯誤";
      alert("❌ 投票失敗：" + reason);
    }
  }
//Timelock 操作
async function queueProposal() {
  const proposalId = document.getElementById("queueProposalId").value;
  const desc = document.getElementById("queueDescription").value;
  const funcName = document.getElementById("queueFunc").value;
  const funcArgRaw = document.getElementById("queueValue").value;

  if (!proposalId || !desc || !funcName || funcArgRaw === "") {
    return alert("⚠️ 請完整填寫所有欄位");
  }

  const descriptionHash = getDescriptionHash(desc);
  const useParseUnits = ["setBorrowerRewardRatio","setLPRewardRatio", "setDailyCap", "setProposalThreshold", "setMaxTotalDebt","injectProtocolEarningsToLP"];
  const governorFuncs = ["setProposalThreshold", "setQuorumPercent"];
  const addressFuncs = ["setGovernance"];

  let funcArg;
  try {
    if (addressFuncs.includes(funcName)) {
      if (!ethers.isAddress(funcArgRaw)) throw new Error("Invalid address");
      funcArg = funcArgRaw;
    } else if (useParseUnits.includes(funcName)) {
      funcArg = ethers.parseUnits(funcArgRaw, 18);
    } else {
      funcArg = parseInt(funcArgRaw);
      if (isNaN(funcArg)) throw new Error("Invalid integer");
    }
  } catch {
    return alert("⚠️ 無法解析參數，請輸入合法數字或地址");
  }

  const isGovFunc = governorFuncs.includes(funcName);
  const contract = isGovFunc ? bankGovernorContract : bankV3Contract;
  const targetAddress = isGovFunc ? governorAddress : bankV3Address;
  const encoded = contract.interface.encodeFunctionData(funcName, [funcArg]);

  const opHash = await bankTimelockContract.hashOperationBatch(
    [targetAddress],
    [0],
    [encoded],
    ethers.ZeroHash,
    descriptionHash
    );


  const tx = await bankGovernorContract.queue(
    [targetAddress],
    [0],
    [encoded],
    descriptionHash
  );

  const receipt = await tx.wait();

  console.log("🟦 [Queue]");
  console.log("🆔 Proposal ID:", proposalId);
  console.log("📌 targetAddress:", targetAddress);
  console.log("💰 value:", 0);
  console.log("🧮 encoded:", encoded);
  console.log("🧾 descriptionHash:", descriptionHash);
  console.log("🔢 funcArg:", funcArg.toString());
  console.log("🔑 operationHash (opHash):", opHash);

  // 🔍 顯示 TimelockController 的事件（例如 CallScheduled）
  console.log("📜 [Timelock Logs]");
  for (const log of receipt.logs) {
    try {
      const parsed = bankTimelockContract.interface.parseLog(log);
      console.log("✅ Event:", parsed.name, parsed.args);
    } catch (e) {
      // 非 timelock 的 log，略過
    }
  }

  alert("⏳ 已排程提案！");
  await checkOperationScheduled(funcName, funcArgRaw, desc);
}
async function executeProposal() {
  const proposalId = document.getElementById("execProposalId").value;
  const desc = document.getElementById("execDescription").value;
  const funcName = document.getElementById("execFunc").value;
  const funcArgRaw = document.getElementById("execValue").value;

  if (!proposalId || !desc || !funcName || funcArgRaw === "") {
    return alert("⚠️ 請完整填寫所有欄位");
  }

  try {
    const descriptionHash = getDescriptionHash(desc);
    const useParseUnits = ["setBorrowerRewardRatio","setLPRewardRatio", "setDailyCap", "setProposalThreshold", "setMaxTotalDebt","injectProtocolEarningsToLP"];
    const governorFuncs = ["setProposalThreshold", "setQuorumPercent"];
    const addressFuncs = ["setGovernance"];

    let funcArg;
    try {
      if (addressFuncs.includes(funcName)) {
        if (!ethers.isAddress(funcArgRaw)) throw new Error("Invalid address");
        funcArg = funcArgRaw;
      } else if (useParseUnits.includes(funcName)) {
        funcArg = ethers.parseUnits(funcArgRaw, 18);
      } else {
        funcArg = parseInt(funcArgRaw);
        if (isNaN(funcArg)) throw new Error("Invalid integer");
      }
    } catch {
      return alert("⚠️ 無法解析參數，請輸入合法數字或地址");
    }

    const isGovFunc = governorFuncs.includes(funcName);
    const contract = isGovFunc ? bankGovernorContract : bankV3Contract;
    const targetAddress = isGovFunc ? governorAddress : bankV3Address;
    const encoded = contract.interface.encodeFunctionData(funcName, [funcArg]);

    const opHash = await bankTimelockContract.hashOperationBatch(
      [targetAddress],
      [0],
      [encoded],
      ethers.ZeroHash,
      descriptionHash
    );


    const scheduledTime = await bankTimelockContract.getTimestamp(opHash);
    const now = BigInt(Math.floor(Date.now() / 1000));

    console.log("🧮 operationHash:", opHash);
    console.log("⏰ 現在時間：", now);
    console.log("📅 Scheduled Timestamp:", scheduledTime.toString());

    if (Number(scheduledTime) === 0) {
      return alert("❌ 此操作尚未排程，請先 queue");
    }

    if (now < scheduledTime) {
      return alert(`⏱️ Timelock 還沒到時間，請再等 ${scheduledTime - now} 秒`);
    }

    console.log("🟥 [Execute]");
    console.log("📌 targetAddress:", targetAddress);
    console.log("💰 value:", 0);
    console.log("🧮 encoded:", encoded);
    console.log("🧾 descriptionHash:", descriptionHash);
    console.log("🔑 operationHash (opHash):", opHash);
    console.log("⏰ 現在時間：", now);
    console.log("📅 Scheduled Timestamp:", scheduledTime.toString());


    const tx = await bankGovernorContract.execute(
      [targetAddress],
      [0],
      [encoded],
      descriptionHash
    );

    await tx.wait();
    alert("🎉 提案已執行！");
  } catch (err) {
    console.error("❌ 執行失敗", err);
    const reason = err?.info?.error?.message || err?.reason || err?.message || "未知錯誤";
    alert("❌ 執行失敗：" + reason);
  }
}
async function checkOperationScheduled(funcName, funcArgRaw, desc) {
  console.log("🛠️ Debug Start");
  console.log("funcName:", funcName);
  console.log("funcArgRaw:", funcArgRaw);

  const descriptionHash = getDescriptionHash(desc);
  const useParseUnits = ["setBorrowerRewardRatio","setLPRewardRatio", "setDailyCap", "setProposalThreshold", "setMaxTotalDebt","injectProtocolEarningsToLP"];
  const governorFuncs = ["setProposalThreshold", "setQuorumPercent"];
  const addressFuncs = ["setGovernance"];

  let funcArg;
  try {
    if (addressFuncs.includes(funcName)) {
      if (!ethers.isAddress(funcArgRaw)) throw new Error();
      funcArg = funcArgRaw;
    } else if (useParseUnits.includes(funcName)) {
      funcArg = ethers.parseUnits(funcArgRaw, 18);
    } else {
      funcArg = parseInt(funcArgRaw);
      if (isNaN(funcArg)) throw new Error();
    }
  } catch {
    return alert("⚠️ funcArg 解析失敗，請輸入合法數字或地址");
  }

  const isGovFunc = governorFuncs.includes(funcName);
  const contract = isGovFunc ? bankGovernorContract : bankV3Contract;
  const targetAddress = isGovFunc ? governorAddress : bankV3Address;
  const encoded = contract.interface.encodeFunctionData(funcName, [funcArg]);

  const opHash = await bankTimelockContract.hashOperationBatch(
    [targetAddress],         // ✅ address[]，必須是 array
    [0],                     // ✅ uint256[]，值也是 array
    [encoded],               // ✅ bytes[]，encoded 也包進 array
    ethers.ZeroHash,
    descriptionHash
  );


  const scheduledTime = await bankTimelockContract.getTimestamp(opHash);
  const now = Math.floor(Date.now() / 1000);
  const isScheduled = await bankTimelockContract.isOperation(opHash);
  const isReady = await bankTimelockContract.isOperationReady(opHash);
  const isDone = await bankTimelockContract.isOperationDone(opHash);

  console.log("🧮 operationHash:", opHash);
  console.log("⏰ 現在時間：", now);
  console.log("📅 Scheduled Timestamp:", scheduledTime.toString());
  console.log("📌 是否已排程：", isScheduled);
  console.log("⌛ 是否可執行：", isReady);
  console.log("🏁 是否已執行：", isDone);

  if (!isScheduled || Number(scheduledTime) === 0) {
    console.warn("❌ 此操作尚未排程（timestamp 為 0）");
  } else if (now < scheduledTime) {
    console.log(`⏳ 還需等待 ${(scheduledTime - now)} 秒`);
  } else {
    console.log("✅ Timelock 時間已到，可以執行！");
  }
}

//投票權委託給自己
async function delegateVotes() {
  const tx = await bankTokenContract.delegate(account);
  await tx.wait();
  await updateVotingInfo(); // ⬅ 放這行

  alert(" 成功委託投票權給自己");
}

function getDescriptionHash(desc) {
  return ethers.keccak256(ethers.toUtf8Bytes(desc.trim()));
}

//---dao提案---
//提交調整利率的提案
  async function proposeChangeInterest() {
    const rate = parseInt(document.getElementById("newInterestRate").value);
    const desc = document.getElementById("proposalDesc").value;

    const encoded = bankV3Contract.interface.encodeFunctionData("setInterestRate", [rate]);
    const target = await bankV3Contract.getAddress();  // ✅
    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();

    alert("✅ 提案成功 ID: " + receipt.logs[0].args.proposalId.toString());
  }
  //提出調整獎勳發放比率的提案
  async function proposeChangeRewardRatio() {
    const ratioRaw = document.getElementById("newRewardRatio").value;
    const newRatio = BigInt(ratioRaw);

    const desc = document.getElementById("proposalDescReward").value;
    if (!desc) return alert("請填寫提案描述");

    const encoded = bankV3Contract.interface.encodeFunctionData("setRewardRatio", [newRatio]);
    const target = await bankV3Contract.getAddress();  // ✅
    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();
    alert(`✅ 提案成功，ID: ${receipt.logs[0].args.proposalId.toString()}`);
  }
  async function proposeSetLPRewardRatio() {
    const ratioRaw = document.getElementById("newLPRewardRatio").value;
    const newRatio = BigInt(ratioRaw);

    const desc = document.getElementById("proposalDescLPReward").value;
    if (!desc) return alert("請填寫提案描述");

    const encoded = bankV3Contract.interface.encodeFunctionData("setLPRewardRatio", [newRatio]);
    const target = await bankV3Contract.getAddress();

    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();

    alert(`✅ LP 發幣提案成功，ID: ${receipt.logs[0].args.proposalId.toString()}`);
  }
  async function proposeSetBorrowerRewardRatio() {
    const ratioRaw = document.getElementById("newBorrowerRewardRatio").value;
    const newRatio = BigInt(ratioRaw);

    const desc = document.getElementById("proposalDescBorrowerReward").value;
    if (!desc) return alert("請填寫提案描述");

    const encoded = bankV3Contract.interface.encodeFunctionData("setBorrowerRewardRatio", [newRatio]);
    const target = await bankV3Contract.getAddress();

    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();

    alert(`✅ Borrower 發幣提案成功，ID: ${receipt.logs[0].args.proposalId.toString()}`);
  }
  //提出調整每日發幣上限的提案
  async function proposeChangeDailyCap() {
    const capRaw = document.getElementById("newDailyCap").value;
    const newCap = BigInt(capRaw);  // ✅ 修正點：直接 BigInt，不 parseUnits
    const desc = document.getElementById("proposalDescCap").value;
    if (!desc) return alert("請填寫提案描述");

    const encoded = bankV3Contract.interface.encodeFunctionData("setDailyCap", [newCap]);
    const target = await bankV3Contract.getAddress();
    const descriptionHash = getDescriptionHash(desc);

    // ✅ 正確使用 batch 版本的 opHash
    const opHash = await bankTimelockContract.hashOperationBatch(
      [target],
      [0],
      [encoded],
      ethers.ZeroHash,
      descriptionHash
    );

    console.log("🟨 [Propose]");
    console.log("📌 target:", target);
    console.log("🧮 encoded:", encoded);
    console.log("🧾 descriptionHash:", descriptionHash);
    console.log("🔑 operationHash (opHash):", opHash);

    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();
    alert("✅ 提案成功，ID: " + receipt.logs[0].args.proposalId.toString());
  }
  //提出調整協議收入比例的提案
  async function proposeChangeReserveFactor() {
    const newFactor = parseInt(document.getElementById("newReserveFactor").value);
    const desc = document.getElementById("proposalDescReserveFactor").value;
    if (!desc) return alert("請填寫提案描述");

    const encoded = bankV3Contract.interface.encodeFunctionData("setReserveFactor", [newFactor]);
    const target = await bankV3Contract.getAddress();  // ✅
    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();
    alert("✅ 已成功提案，ID: " + receipt.logs[0].args.proposalId.toString());
  }
  // 提案轉移治理權限（更新 governance）
  window.proposeChangeGovernance = async function () {
    const newGov = document.getElementById("newGovernanceAddr").value;
    const desc = document.getElementById("proposalDescGovernance").value;
    if (!ethers.isAddress(newGov) || !desc) return alert("請輸入正確地址與描述");

    const encoded = bankV3Contract.interface.encodeFunctionData("setGovernance", [newGov]);
    const target = await bankV3Contract.getAddress();  // ✅
    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();
    alert("✅ 提案成功，ID: " + receipt.logs[0].args.proposalId.toString());
  };
  //提出調整「提案有效票數門檻（%）」的提案(g)
  window.proposeChangeQuorumPercent = async function () {
    const percent = parseInt(document.getElementById("newQuorumPercent").value);
    const desc = document.getElementById("proposalDescQuorum").value;
    if (isNaN(percent) || percent <= 0 || percent > 100 || !desc) {
      return alert("請輸入 1~100 的百分比與描述");
    }

    const encoded = bankGovernorContract.interface.encodeFunctionData("setQuorumPercent", [percent]);
    const target = await bankGovernorContract.getAddress();  // ✅
    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();
    alert("✅ 提案成功，ID: " + receipt.logs[0].args.proposalId.toString());
  };
  //提出調整「提案門檻」的提案(g)
  async function proposeChangeProposalThreshold() {
    const input = document.getElementById("newProposalThreshold").value;
    const threshold = ethers.parseUnits(input, 18);
    const desc = document.getElementById("proposalDescThreshold").value;
    if (!desc) return alert("請填寫提案描述");

    const encoded = bankGovernorContract.interface.encodeFunctionData("setProposalThreshold", [threshold]);
    const target = await bankGovernorContract.getAddress();  // ✅
    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();
    alert("✅ 已成功提交提案，ID: " + receipt.logs[0].args.proposalId.toString());
  }
  async function proposeInjectToLP() {
    const amountRaw = document.getElementById("injectLPAmount").value;
    const desc = document.getElementById("proposalDescInjectLP").value;

    if (!desc) return alert("請填寫提案描述");

    const amount = BigInt(amountRaw); // 選單已是 wei 單位，不需 parseUnits
    const encoded = bankV3Contract.interface.encodeFunctionData("injectProtocolEarningsToLP", [amount]);
    const target = await bankV3Contract.getAddress();

    const tx = await bankGovernorContract.propose([target], [0], [encoded], desc);
    const receipt = await tx.wait();

    alert("✅ 提案成功，ID: " + receipt.logs[0].args.proposalId.toString());
  }

// === LP 操作 ===
  async function lpSupply() {
    await safeAction("提供流動性", async () => {
      const amount = document.getElementById("lpSupplyAmount").value;
      if (!amount || isNaN(amount) || parseFloat(amount) <= 0)
        throw new Error("請輸入正確的 mDAI 數量");

      console.log("📥 提供流動性金額:", amount, "mDAI");

      const rewardRatio = await bankV3Contract.rewardRatio();                    // 每 1 mDAI 可拿幾顆 BKT
      const cap = await bankV3Contract.dailyCap();                              // 每日上限 BKT 數量
      const joinedAt = await bankV3Contract.lpJoinedAt(account);                // 加入時間戳
      const bktVotes = await bankTokenContract.getVotes(account);               // 擁有投票權（需 delegate）
      const bktBalance = await bankTokenContract.balanceOf(account);            // BKT 餘額

      console.log("rewardRatio:", rewardRatio.toString());
      console.log("dailyCap:", ethers.formatUnits(cap, 18));
      console.log("lpJoinedAt:", joinedAt.toString());
      console.log("目前票數（votes）:", ethers.formatUnits(bktVotes, 18));
      console.log("目前 BKT 餘額:", ethers.formatUnits(bktBalance, 18));

      const parsedAmount = ethers.parseUnits(amount, 18);
      await miniDaiContract.approve(bankV3Address, parsedAmount);
      const tx = await bankV3Contract.supply(parsedAmount);
      await tx.wait();
    });
  }
  async function lpRedeem() {
    await safeAction("贖回流動性", async () => {
      const amount = document.getElementById("lpRedeemAmount").value;
      if (!amount || isNaN(amount) || parseFloat(amount) <= 0)
        throw new Error("請輸入正確的 aMDAI 數量");

      const parsedAmount = ethers.parseUnits(amount, 18);
      const tx = await bankV3Contract.redeem(parsedAmount);
      await tx.wait();
    });
  }

// 綁定到 window
window.proposeChangeProposalThreshold = proposeChangeProposalThreshold;
window.delegateVotes = delegateVotes;
window.proposeChangeInterest = proposeChangeInterest;
window.castVote = castVote;
window.queueProposal = queueProposal;
window.executeProposal = executeProposal;
window.updateVotingInfo        = updateVotingInfo;
window.proposeChangeInterest   = proposeChangeInterest;
window.proposeChangeRewardRatio= proposeChangeRewardRatio;
window.proposeChangeDailyCap   = proposeChangeDailyCap;
window.connectWallet = connectWallet;
window.depositETH = depositETH;
window.borrow = borrow;
window.repay = repay;
window.withdrawCollateral = withdrawCollateral;
window.liquidateUser = liquidateUser;
window.simulatePriceChange = simulatePriceChange;
window.checkProposalVotes = checkProposalVotes;
