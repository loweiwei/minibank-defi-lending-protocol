// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MiniDAI.sol";
import "./PriceOracle.sol";
import "./aMDAI.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IBankToken {
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IaMDAI {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
}

/// @title BankV3
/// @notice Core MiniBank lending protocol for the local/testnet prototype.
/// @dev Handles ETH collateral, mDAI liquidity, debt accounting, liquidation, BKT rewards, and DAO-controlled parameters.
contract BankV3 is ReentrancyGuard {
    using SafeERC20 for MiniDAI;

    // === External contracts ===
    MiniDAI public miniDai;
    PriceOracle public priceOracle;
    IBankToken public bankToken;
    IaMDAI public aMDAIToken;

    address public governance;

    // === Protocol status ===
    Status public status;
    bool public governanceLocked = false;

    // === DAO-controlled risk and reward parameters ===
    uint256 public interestRate = 500;           // Borrow interest rate, in basis points. 500 = 5% over the demo accrual period.
    uint256 public maxTotalDebt = 1_000_000 * 1e18; // Governance-visible demo debt cap; not enforced by borrow() in this prototype.
    uint256 public reserveFactor = 1000;         // 協議利息抽成比例（10%）
    uint256 public rewardRatio = 318287037037 ; // Legacy reward parameter kept for governance/demo visibility.
    uint256 public lpRewardRatio = 3e11;         // 每秒每 USD 給 LP 的發幣速率
    uint256 public borrowerRewardRatio = 1.5e11; // 給 Borrower 的發幣速率
    uint256 public dailyCap = 275e18;           // 每日最多發放 BKT 數量上限
    uint256 public lastRewardUpdateTime;     // 上一次 reward 結算時間戳（用來判斷是否跨日）
    uint256 public LTV = 8000;                   // 抵押品 LTV 值（80%）
    uint256 public LIQUIDATION_THRESHOLD = 9000; // 90% liquidation threshold, used inside the standard HF formula.
    uint256 public BONUS_PERCENT = 1000;         // 清算人可獲得 10% 額外 ETH 獎勵
    uint256 public MAX_ELAPSED_TIME = 30 days;   // 最長計息時間（避免利息爆炸）

    // === Fixed precision and liquidation constants ===
    uint256 public constant DECIMALS = 1e4;          // 比例精度（萬分比）
    uint256 public constant MAX_LIQUIDATION_PERCENT = 5000; // 最多可清算 50% 債務
    uint256 constant PRICE_DIV = 1e26;               // Reserved price conversion constant kept for compatibility with earlier calculations.
    uint256 public constant SECONDS_PER_YEAR = 60;   // Demo-only constant retained for frontend/test visibility.

    // === Aggregate protocol accounting ===
    uint256 public liquidityPool;        // mDAI 流動性池（LP 提供）
    uint256 public totalDebtCached;      // 全部用戶債務（含利息）
    uint256 public totalCollateral;      // 全部用戶抵押的 ETH 總量

    // === Protocol reserves ===
    uint256 public protocolTokenReserve; // MiniDAI 收益儲備
    uint256 public protocolETHReserve;   // ETH 收益儲備（清算回收）

    // === Reward emission accounting ===
    uint256 public distributedToday;         // 當日已發放的獎勳總量（BKT）
    uint256 public lastRewardDay;        // Legacy day counter retained for ABI/frontend compatibility.
    uint256 constant SUPPLIER_BASE = 7000;  // Legacy role split constant retained for documentation/demo context.
    uint256 constant BORROWER_BASE = 3000;  // Legacy role split constant retained for documentation/demo context.

    // === User accounting structs ===
    struct DebtInfo {
        uint256 principal;
        uint256 lastAccrued;
    }
    struct RewardInfo {
        uint256 lastUpdate;      // 上次更新時間
        uint256 unclaimedBKT;    // 累積的可領獎勳
        uint256 supplyAmount;    // Reward base: LP supplied mDAI or borrower outstanding debt.
    }

    // === Per-user state ===
    mapping(address => uint256) public collateral; // User ETH collateral, in wei.
    mapping(address => uint256) public lpJoinedAt;            // LP 供應時間
    mapping(address => uint256) public collateralJoinedAt;    // 抵押 ETH 的時間
    mapping(address => RewardInfo) public lpRewards;        // LP reward accounting.
    mapping(address => RewardInfo) public borrowerRewards;  // Borrower reward accounting.
    mapping(address => DebtInfo) public debts;

    // === Events ===
    event Borrowed(address indexed user, uint256 amount);
    event RepaidDetailed(address indexed user, uint256 burned, uint256 toLP, uint256 toProtocol);
    event Liquidated(address indexed liquidator, address indexed user, uint256 seizedCollateral);
    event StatusChanged(Status newStatus);
    event Withdrawn(address indexed user, uint256 amount);
    event ReserveWithdrawn(address indexed recipient, uint256 amount);
    event RewardMinted(address indexed user, uint256 amount);
    event RewardRatioChanged(uint256 newRatio);
    event DailyCapChanged(uint256 newCap);
    event Supplied(address indexed user, uint256 miniDAIAmount, uint256 shares);
    event Redeemed(address indexed user, uint256 miniDAIAmount, uint256 shares);
    event CollateralDeposited(address indexed user, uint256 amount);
    event CollateralWithdrawn(address indexed user, uint256 amount);
    event ProtocolEarningsInjected(uint256 tokenAmount);
    event GovernanceTransferred(address oldGov, address newGov);
    event RewardClaimed(address indexed user, uint256 amount);

    // === Access control ===
    modifier onlyGovernance() {
        require(
            msg.sender == governance ,
            "!gov"
        );
        _;
    }
    enum Status { STARTED, PAUSED, CLOSED }
    modifier onlyStarted() { require(status == Status.STARTED, "Not started"); _; }

    // === Constructor ===
    constructor(address _miniDai, address _oracle, address _governance, address _bkt, address _aMDAI) {
        miniDai = MiniDAI(_miniDai);
        priceOracle = PriceOracle(_oracle);
        governance = _governance;
        bankToken = IBankToken(_bkt);
        aMDAIToken = IaMDAI(_aMDAI);
        status = Status.STARTED;
        lastRewardUpdateTime = block.timestamp;
    }

    // === DAO parameter management ===
    /// @notice Updates the borrower interest rate. Only the governance/timelock address can call this.
    function setInterestRate(uint256 newRate) external onlyGovernance {
        require(newRate <= 2000, "Too high");
        interestRate = newRate;
    }

    /// @notice Updates the legacy reward ratio kept for demo/governance visibility.
    function setRewardRatio(uint256 newRatio) external onlyGovernance {
        rewardRatio = newRatio;
        emit RewardRatioChanged(newRatio);
    }

    /// @notice Updates the BKT emission rate for LP providers.
    function setLPRewardRatio(uint256 newRatio) external onlyGovernance {
        lpRewardRatio = newRatio;
    }

    /// @notice Updates the BKT emission rate for borrowers.
    function setBorrowerRewardRatio(uint256 newRatio) external onlyGovernance {
        borrowerRewardRatio = newRatio;
    }

    /// @notice Updates the daily BKT emission cap.
    function setDailyCap(uint256 newCap) external onlyGovernance {
        dailyCap = newCap;
        emit DailyCapChanged(newCap);
    }

    /// @notice Updates the percentage of interest/liquidation repayment kept as protocol reserve.
    function setReserveFactor(uint256 newFactor) external onlyGovernance {
        require(newFactor <= 2000, "Too high");
        reserveFactor = newFactor;
    }

    /// @notice Updates the governance-visible debt cap used by the frontend/demo.
    function setMaxTotalDebt(uint256 newMax) external onlyGovernance {
        require(newMax >= 100_000 * 1e18, "Too low");
        maxTotalDebt = newMax;
    }

    /// @notice Transfers governance before it is locked.
    function setGovernance(address newGov) external onlyGovernance {
        require(!governanceLocked, "Governance is locked");
        governance = newGov;
    }
    /// @notice Permanently disables future governance address changes.
    function lockGovernance() external onlyGovernance {
        governanceLocked = true;
    }
    /// @notice Pauses, resumes, or closes protocol actions.
    function changeStatus(Status _status) external onlyGovernance {
        status = _status;
        emit StatusChanged(_status);
    }

    /// @notice Allows governance to withdraw ETH reserves tracked by the protocol.
    function withdrawETHReserve(address to, uint256 amount) external onlyGovernance nonReentrant {
        require(amount <= protocolETHReserve, "Insufficient reserve");
        protocolETHReserve -= amount;
        _sendETH(to, amount);
        emit ReserveWithdrawn(to, amount);
    }

    /// @notice Allows governance to withdraw accumulated mDAI protocol reserve.
    function withdrawTokenReserve(address to, uint256 amount) external onlyGovernance nonReentrant {
        require(amount <= protocolTokenReserve, "Too much");
        protocolTokenReserve -= amount;
        miniDai.safeTransfer(to, amount);
        emit ReserveWithdrawn(to, amount);

    }

    /// @notice Recycles protocol mDAI earnings back into LP liquidity instead of withdrawing them.
    function injectProtocolEarningsToLP(uint256 amount) external onlyGovernance {
        require(amount <= protocolTokenReserve, "Too much");

        protocolTokenReserve -= amount;
        liquidityPool += amount;

        emit ProtocolEarningsInjected(amount);
    }

    /// @notice Transfers governance and emits an event for frontend/indexer visibility.
    function transferGovernance(address newGov) external onlyGovernance {
        require(!governanceLocked, "Governance locked");
        emit GovernanceTransferred(governance, newGov);
        governance = newGov;
    }

    // === Internal accounting helpers ===
    /// @dev Materializes accrued interest into principal so later operations use fresh debt.
    function _updateDebt(address user) internal {
        uint256 old = debts[user].principal;
        (uint256 principal, uint256 interest) = getUserDebt(user);
        uint256 updated = principal + interest;
        debts[user].principal = updated;
        debts[user].lastAccrued = block.timestamp;

        if (updated >= old) {
            totalDebtCached += updated - old;
        } else if (old > updated) {
            uint256 diff = old - updated;
            if (totalDebtCached >= diff) totalDebtCached -= diff;
            else totalDebtCached = 0;
        }
    }

    /// @dev Sends ETH using call and reverts on failure.
    function _sendETH(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "ETH transfer failed");
    }

    /// @notice Returns principal plus currently accrued interest for a borrower.
    function _accruedDebt(address user) public view returns (uint256) {
        DebtInfo memory d = debts[user];
        uint256 elapsed = block.timestamp - d.lastAccrued;
        if (elapsed > MAX_ELAPSED_TIME) elapsed = MAX_ELAPSED_TIME;
        // Demo uses 1 day as the interest period so accrual is observable in local tests.
        uint256 interest = (d.principal * interestRate * elapsed) / (1 days * DECIMALS);
        return d.principal + interest;
    }

    /// @dev Settles BKT rewards for either LP or borrower role before changing that user's reward base.
    function _updateReward(address user, bool isLP) internal {
        RewardInfo storage info = isLP ? lpRewards[user] : borrowerRewards[user];
        uint256 current = block.timestamp;

        if (info.lastUpdate == 0) {
            info.lastUpdate = current;
            return;
        }

        uint256 timeElapsed = current - info.lastUpdate;
        if (timeElapsed == 0 || info.supplyAmount == 0) return;

        uint256 usdValue;
        if (isLP) {
            usdValue = info.supplyAmount;
        } else {
            usdValue = info.supplyAmount;
        }

        // LP and borrower use different reward speeds to model role-specific incentives.
        uint256 ratio = isLP ? lpRewardRatio : borrowerRewardRatio;
        uint256 pending = usdValue * ratio * timeElapsed / 1e18;

        // Reset the daily emission counter when the timestamp crosses into a new UTC day.
        if (current / 1 days > lastRewardUpdateTime / 1 days) {
            distributedToday = 0;
        }

        uint256 available = dailyCap > distributedToday ? (dailyCap - distributedToday) : 0;

        if (pending > available) {
            pending = available;
        }

        info.unclaimedBKT += pending;
        info.lastUpdate = current;
        distributedToday += pending;
        lastRewardUpdateTime = current;
    }
    // === Borrower actions ===
    /// @notice Borrows mDAI against the caller's ETH collateral.
    /// @dev Checks both LTV and available LP liquidity before transferring mDAI out.
    function borrow(uint256 amount) external onlyStarted {
        _updateReward(msg.sender, false);
        _updateDebt(msg.sender);
        borrowerRewards[msg.sender].supplyAmount = debts[msg.sender].principal;

        uint256 maxBorrow = getCollateralValueUSD(msg.sender) * LTV / DECIMALS;
        require(debts[msg.sender].principal + amount <= maxBorrow, "Exceeds LTV");
        require(amount <= liquidityPool, "Not enough liquidity");

        debts[msg.sender].principal += amount;
        debts[msg.sender].lastAccrued = block.timestamp;
        borrowerRewards[msg.sender].supplyAmount = debts[msg.sender].principal;
        totalDebtCached += amount;
        liquidityPool -= amount;

        miniDai.safeTransfer(msg.sender, amount);
        emit Borrowed(msg.sender, amount);
    }

    /// @notice Deposits ETH collateral for future borrowing.
    function depositCollateral() external payable onlyStarted {
        require(msg.value > 0, "Zero collateral");

        if (collateral[msg.sender] == 0) {
            collateralJoinedAt[msg.sender] = block.timestamp;
        }
        collateral[msg.sender] += msg.value;
        totalCollateral += msg.value;

        emit CollateralDeposited(msg.sender, msg.value);
    }

    /// @notice Withdraws ETH collateral while keeping the account above the required LTV.
    function withdrawCollateral(uint256 amount) external onlyStarted nonReentrant {
        require(amount > 0 && amount <= collateral[msg.sender], "Invalid");

        _updateDebt(msg.sender);
        _updateReward(msg.sender, false);
        borrowerRewards[msg.sender].supplyAmount = debts[msg.sender].principal;

        uint256 newCol = collateral[msg.sender] - amount;
        uint256 debt = _accruedDebt(msg.sender);

        // Collateral can be freely withdrawn only when there is no outstanding debt.
        if (debt > 0) {
            uint256 ethPrice = priceOracle.getLatestETHPrice(); // 1e8
            uint256 newColUSD = (newCol * ethPrice) / 1e8;
            uint256 requiredColUSD = (debt * DECIMALS) / LTV;

            require(newColUSD >= requiredColUSD, "Undercollateralized");
        }

        collateral[msg.sender] = newCol;
        totalCollateral -= amount;

        if (newCol == 0) {
            borrowerRewards[msg.sender] = RewardInfo(0, 0, 0);
        }

        _sendETH(msg.sender, amount);
        emit CollateralWithdrawn(msg.sender, amount);
    }

    /// @notice Repays mDAI debt and splits the payment into principal, LP income, and protocol reserve.
    function repay(uint256 amount) external onlyStarted {
        require(amount > 0, "Zero repay");
        _updateReward(msg.sender, false);

        (uint256 principal, uint256 interest) = getUserDebt(msg.sender);
        uint256 userTotalDebt = principal + interest;
        require(userTotalDebt > 0, "No debt");

        uint256 actualAmount = amount > userTotalDebt ? userTotalDebt : amount;

        // Pull the requested amount first, then refund any overpayment above total debt.
        miniDai.safeTransferFrom(msg.sender, address(this), amount);

        if (amount > actualAmount) {
            uint256 refund = amount - actualAmount;
            miniDai.safeTransfer(msg.sender, refund);
        }

        // Interest is paid first. Any remaining repayment reduces principal.
        uint256 toBurn = actualAmount >= userTotalDebt
            ? principal
            : actualAmount > interest
                ? actualAmount - interest
                : 0;

        // Protocol reserve is taken from the interest-paid portion.
        uint256 toProtocol = actualAmount > interest
            ? interest * reserveFactor / DECIMALS
            : actualAmount * reserveFactor / DECIMALS;

        // The remainder returns to LP liquidity as interest income.
        uint256 toLP = actualAmount - toBurn - toProtocol;

        if (toBurn > 0) {
            debts[msg.sender].principal -= toBurn;
            totalDebtCached -= toBurn;
        }

        // Refresh accrual timestamp after principal has been adjusted.
        _updateDebt(msg.sender);
        borrowerRewards[msg.sender].supplyAmount = debts[msg.sender].principal;

        liquidityPool += toLP + toBurn;
        protocolTokenReserve += toProtocol;

        emit RepaidDetailed(msg.sender, toBurn, toLP, toProtocol);
    }

    // === Liquidation ===
    /// @notice Liquidates an unhealthy borrower by repaying mDAI and receiving seized ETH collateral.
    /// @dev Requires health factor below 1. Repay amount is capped by close factor and available collateral.
    function liquidate(address user, uint256 repayAmount) external onlyStarted nonReentrant {
        require(repayAmount > 0, "Zero repay");
        (uint256 rawPrincipal, uint256 interest) = getUserDebt(user);
        _updateDebt(user);

        uint256 hf = getHealthFactor(user);
        require(hf < DECIMALS, "Health factor ok");

        uint256 principalBefore = debts[user].principal;

        // Close factor limits how much debt can be liquidated in a single transaction.
        uint256 maxRepay = principalBefore * MAX_LIQUIDATION_PERCENT / 10000;

        if (repayAmount > maxRepay) {
            repayAmount = maxRepay;
        }

        uint256 ethPrice = priceOracle.getLatestETHPrice()* 1e10;

        uint256 userCollateral = collateral[user];

        // Cap repay so seized collateral never exceeds the borrower's available ETH.
        uint256 maxRewardUSD = userCollateral * ethPrice / 1e18;

        uint256 maxEffectiveRepay = maxRewardUSD * DECIMALS / (BONUS_PERCENT + DECIMALS);

        uint256 maxRepayWithProtocol = maxEffectiveRepay * (1e4 + reserveFactor) / 1e4;

        if (repayAmount > maxRepayWithProtocol) {
            repayAmount = maxRepayWithProtocol;
        }

        miniDai.safeTransferFrom(msg.sender, address(this), repayAmount);

        uint256 protocolShare = repayAmount * reserveFactor / 1e4;
        uint256 effectiveRepay = repayAmount - protocolShare;

        uint256 toLP;
        uint256 burned;

        if (effectiveRepay <= interest) {
            toLP = effectiveRepay;
            burned = 0;
        } else {
            toLP = interest;
            burned = effectiveRepay - interest;
        }

        uint256 rewardUSD = effectiveRepay * (BONUS_PERCENT + DECIMALS) / DECIMALS;

        uint256 seized = rewardUSD * 1e18 / ethPrice;

        if (seized > userCollateral) {
            seized = userCollateral;
        }

        // Settle borrower rewards before changing debt/collateral bases.
        _updateReward(user, false);

        collateral[user] -= seized;
        totalCollateral -= seized;

        if (rawPrincipal >= burned) {
            debts[user].principal = rawPrincipal - burned;
        } else {
            debts[user].principal = 0;
        }
        debts[user].lastAccrued = block.timestamp;
        borrowerRewards[user].supplyAmount = debts[user].principal;

        if (totalDebtCached >= burned) {
            totalDebtCached -= burned;
        } else {
            totalDebtCached = 0;
        }

        liquidityPool  += effectiveRepay ;
        protocolTokenReserve += protocolShare;

        _sendETH(msg.sender, seized);

        emit Liquidated(msg.sender, user, seized);
        emit RepaidDetailed(user, burned, toLP, protocolShare);
    }

    /// @notice Estimates the maximum mDAI amount that can be used to liquidate a borrower now.
    function estimateMaxLiquidate(address user) external view returns (uint256) {
        uint256 principal = debts[user].principal;
        if (principal == 0) return 0;

        uint256 maxRepay = principal * MAX_LIQUIDATION_PERCENT / 1e4;

        uint256 ethPrice = priceOracle.getLatestETHPrice() * 1e10; // Convert oracle 1e8 price to 1e18 scale.
        uint256 colETH = collateral[user];

        uint256 maxRewardUSD = (colETH * ethPrice) / 1e18;

        uint256 maxEffectiveRepay = maxRewardUSD * DECIMALS / (BONUS_PERCENT + DECIMALS);

        uint256 maxRepayWithProtocol = maxEffectiveRepay * (1e4 + reserveFactor) / 1e4;

        return maxRepayWithProtocol < maxRepay ? maxRepayWithProtocol : maxRepay;
    }

    // === LP liquidity ===
    /// @notice Supplies mDAI to the lending pool and receives aMDAI pool shares.
    function supply(uint256 amount) external onlyStarted nonReentrant {
        require(amount > 0, "Zero supply");
        _updateReward(msg.sender, true);
        miniDai.safeTransferFrom(msg.sender, address(this), amount);

        uint256 poolBefore = liquidityPool;
        uint256 totalShares = aMDAIToken.totalSupply();
        uint256 shares = (totalShares == 0 || poolBefore == 0)
            ? amount
            : amount * totalShares / poolBefore;

        aMDAIToken.mint(msg.sender, shares);
        liquidityPool += amount;

        if (lpJoinedAt[msg.sender] == 0) {
            lpJoinedAt[msg.sender] = block.timestamp;
        }
        lpRewards[msg.sender].supplyAmount += amount;

        emit Supplied(msg.sender, amount, shares);
    }

    /// @notice Burns aMDAI shares and redeems the caller's proportional mDAI from the pool.
    function redeem(uint256 amount) external onlyStarted nonReentrant {
        require(amount > 0, "Zero redeem");

        _updateReward(msg.sender, true);

        uint256 totalSupply = aMDAIToken.totalSupply();
        require(totalSupply > 0, "No aMDAIToken");

        uint256 redeemAmount = liquidityPool * amount / totalSupply;
        require(redeemAmount <= liquidityPool, "Insufficient pool liquidity");

        if (lpRewards[msg.sender].supplyAmount >= redeemAmount) {
            lpRewards[msg.sender].supplyAmount -= redeemAmount;
        } else {
            lpRewards[msg.sender].supplyAmount = 0;
        }

        aMDAIToken.burn(msg.sender, amount);
        liquidityPool -= redeemAmount;
        miniDai.safeTransfer(msg.sender, redeemAmount);

        emit Redeemed(msg.sender, redeemAmount, amount);
    }

    /// @notice Returns current mDAI per aMDAI share, scaled by 1e18.
    function getExchangeRate() public view returns (uint256) {
        uint256 totalShares = aMDAIToken.totalSupply();

        if (totalShares == 0) {
            return 1e18; // 初始兌換比 = 1.0
        }

        return liquidityPool * 1e18 / totalShares;
    }
    // === Rewards ===
    /// @notice Claims accumulated BKT rewards for either LP role or borrower role.
    /// @param isLP true claims LP rewards; false claims borrower rewards.
    function claimReward(bool isLP) external {
        _updateReward(msg.sender, isLP);
        RewardInfo storage info = isLP ? lpRewards[msg.sender] : borrowerRewards[msg.sender];

        uint256 amount = info.unclaimedBKT;
        require(amount > 0, "Nothing to claim");

        info.unclaimedBKT = 0;
        require(bankToken.transfer(msg.sender, amount), "BKT transfer failed");
        emit RewardClaimed(msg.sender, amount);
    }

    // === View helpers ===
    function getBorrowerRewardInfo(address user) external view returns (RewardInfo memory) {
        return borrowerRewards[user];
    }

    /// @notice Returns a user's ETH collateral value in mDAI/USD precision.
    function getCollateralValueUSD(address user) public view returns (uint256) {
        return collateral[user] * priceOracle.getLatestETHPrice() / 1e8;
    }

    /// @notice Returns health factor scaled by 1e4. Values below 1e4 mean the position is liquidatable.
    function getHealthFactor(address user) public view returns (uint256) {
        uint256 debt = _accruedDebt(user);
        if (debt == 0) return type(uint256).max;
        if (collateral[user] < 1e10) return 0;
        return getCollateralValueUSD(user) * LIQUIDATION_THRESHOLD / debt;
    }

    /// @notice Returns pool utilization as debt / total assets, scaled by 1e4.
    function getUtilizationRate() public view returns (uint256) {
        uint256 totalAssets = totalDebtCached + liquidityPool;
        if (totalAssets == 0) return 0;
        return totalDebtCached * DECIMALS / totalAssets;
    }

    /// @notice Returns how much ETH a borrower can withdraw without breaking LTV.
    function getMaxWithdrawableETH(address user) external view returns (uint256) {
        uint256 ethPrice = priceOracle.getLatestETHPrice(); // 1e8
        uint256 debt = _accruedDebt(user); // 1e18 wei = mDAI

        uint256 userColETH = collateral[user];
        if (debt == 0) {
            return userColETH;
        }

        // Keep values in 1e18 mDAI/USD precision to avoid truncation during risk checks.
        uint256 minRequiredColUSD = (debt * DECIMALS) / LTV;
        uint256 currentColUSD = (userColETH * ethPrice) / 1e8;

        if (currentColUSD <= minRequiredColUSD) return 0;

        uint256 withdrawableUSD = currentColUSD - minRequiredColUSD;

        return (withdrawableUSD * 1e8) / ethPrice;
    }

    /// @notice Returns the user's stored principal and newly accrued interest.
    function getUserDebt(address user) public view returns (uint256 principal, uint256 interest) {
        DebtInfo memory d = debts[user];
        uint256 elapsed = block.timestamp - d.lastAccrued;
        if (elapsed > MAX_ELAPSED_TIME) elapsed = MAX_ELAPSED_TIME;
        uint256 accrued = d.principal * interestRate * elapsed / (1 days * DECIMALS);
        return (d.principal, accrued);
    }

    /// @notice Returns collateral value, total debt, and remaining borrow capacity for a user.
    function getUserAccountData(address user) external view returns (
        uint256 collateralUSD,
        uint256 debt,
        uint256 available
    ) {
        uint256 c = getCollateralValueUSD(user);
        uint256 d = _accruedDebt(user);
        uint256 limit = c * LTV / DECIMALS;
        uint256 avail = limit > d ? limit - d : 0;
        return (c, d, avail);
    }
    function getProtocolETHReserve() external view returns (uint256) {
        return protocolETHReserve;
    }
    function getProtocolTokenReserve() external view returns (uint256) {
        return protocolTokenReserve;
    }
    function getCurrentETHPrice() external view returns (uint256) {
        return priceOracle.getLatestETHPrice();
    }
    function getInterestRate() external view returns (uint256) {
        return interestRate;
    }
    function getStatus() external view returns (Status) {
        return status;
    }
    /// @notice Returns the ETH price at which the user's health factor reaches 1.
    function getLiquidationPrice(address user) external view returns (uint256) {
        uint256 principalWei = _accruedDebt(user);   // DAI-wei
        uint256 collateralWei = collateral[user];          // ETH-wei
        if (principalWei == 0 || collateralWei == 0) {
            return 0;
        }

        // Convert DAI-wei debt to USD with 8 decimals, matching the oracle scale.
        uint256 debtUSD8 = principalWei * 1e8 / 1e18;

        // Rearranged health factor formula solved for ETH price when HF = 1.
        return debtUSD8 * DECIMALS * 1e18 / (collateralWei * LIQUIDATION_THRESHOLD);
    }

    function getTotalSupplied() external view returns (uint256) {
        return liquidityPool;
    }

    /// @notice Returns LP share balance, total shares, pool share percentage, and redeemable mDAI.
    function getLPInfo(address user) external view returns (
        uint256 userAMDAI,
        uint256 totalAMDAI,
        uint256 sharePercent,      // 萬分比（1e4 = 10000 = 100%）
        uint256 redeemableMDAI
    ) {
        uint256 userShare = aMDAIToken.balanceOf(user);
        uint256 totalShares = aMDAIToken.totalSupply();
        uint256 redeemable = totalShares == 0 ? 0 : liquidityPool * userShare / totalShares;
        uint256 percent = totalShares == 0 ? 0 : userShare * 1e4 / totalShares;

        return (userShare, totalShares, percent, redeemable);
    }

    /// @notice Returns current interest that has accrued but has not yet been materialized into principal.
    function previewInterest(address user) public view returns (uint256) {
        (, uint256 interest) = getUserDebt(user);
        return interest;
    }

    /// @notice Returns principal plus currently accrued interest.
    function getTotalDebt(address user) external view returns (uint256) {
        (uint256 principal, uint256 interest) = getUserDebt(user);
        return principal + interest;
    }

    /// @notice Debug helper for frontend/tests to inspect debt accrual components.
    function debugDebtDetail(address user) external view returns (
        uint256 principal,
        uint256 interestRate_,
        uint256 elapsed,
        uint256 interest,
        uint256 totalDebt
    ) {
        DebtInfo memory d = debts[user];
        uint256 nowTime = block.timestamp;
        uint256 elapsedTime = nowTime - d.lastAccrued;
        if (elapsedTime > MAX_ELAPSED_TIME) elapsedTime = MAX_ELAPSED_TIME;

        uint256 interestAccrued = d.principal * interestRate * elapsedTime / (1 days * DECIMALS);
        return (
            d.principal,
            interestRate,
            elapsedTime,
            interestAccrued,
            d.principal + interestAccrued
        );
    }

    /// @notice Debug helper for inspecting elapsed time since the last debt accrual update.
    function debugElapsed(address user) external view returns (
        uint256 principal,
        uint256 elapsed,
        uint256 nowTime,
        uint256 lastAccrued
    ) {
        DebtInfo memory d = debts[user];
        return (d.principal, block.timestamp - d.lastAccrued, block.timestamp, d.lastAccrued);
    }

    /// @notice Returns uncapped reward preview for either LP or borrower role.
    function getUnclaimedReward(address user, bool isLP) external view returns (uint256) {
        RewardInfo storage info = isLP ? lpRewards[user] : borrowerRewards[user];

        if (info.lastUpdate == 0 || info.supplyAmount == 0) {
            return info.unclaimedBKT;
        }

        uint256 timeElapsed = block.timestamp - info.lastUpdate;
        if (timeElapsed == 0) {
            return info.unclaimedBKT;
        }

        uint256 usdValue;
        if (isLP) {
            usdValue = info.supplyAmount; // mDAI = USD × 1e18
        } else {
            usdValue = info.supplyAmount;
        }

        uint256 ratio = isLP ? lpRewardRatio : borrowerRewardRatio;
        uint256 pending = usdValue * ratio * timeElapsed / 1e18;
        return info.unclaimedBKT + pending;
    }

    /// @notice Returns reward preview after applying the daily emission cap.
    function getRewardPreviewCapped(address user, bool isLP) external view returns (uint256) {
        RewardInfo storage info = isLP ? lpRewards[user] : borrowerRewards[user];

        if (info.lastUpdate == 0 || info.supplyAmount == 0) {
            return info.unclaimedBKT;
        }

        uint256 timeElapsed = block.timestamp - info.lastUpdate;
        if (timeElapsed == 0) {
            return info.unclaimedBKT;
        }

        uint256 usdValue;
        if (isLP) {
            usdValue = info.supplyAmount;
        } else {
            usdValue = info.supplyAmount;
        }

        uint256 ratio = isLP ? lpRewardRatio : borrowerRewardRatio;
        uint256 pending = usdValue * ratio * timeElapsed / 1e18;
        uint256 distributed = (block.timestamp / 1 days > lastRewardUpdateTime / 1 days)
            ? 0
            : distributedToday;

        uint256 available = dailyCap > distributed ? (dailyCap - distributed) : 0;
        if (pending > available) {
            pending = available;
        }

        return info.unclaimedBKT + pending;
    }

    /// @notice Returns the reward amount claimable if it were settled now, capped by remaining daily budget.
    function getPendingReward(address user, bool isLP) public view returns (uint256) {
        RewardInfo storage info = isLP ? lpRewards[user] : borrowerRewards[user];

        if (info.lastUpdate == 0 || info.supplyAmount == 0) {
            return info.unclaimedBKT;
        }

        uint256 current = block.timestamp;
        uint256 timeElapsed = current - info.lastUpdate;
        if (timeElapsed == 0) {
            return info.unclaimedBKT;
        }

        uint256 usdValue;
        if (isLP) {
            usdValue = info.supplyAmount; // mDAI = USD × 1e18
        } else {
            usdValue = info.supplyAmount;
        }

        uint256 ratio = isLP ? lpRewardRatio : borrowerRewardRatio;
        uint256 pending = usdValue * ratio * timeElapsed / 1e18;

        uint256 available = dailyCap > distributedToday ? (dailyCap - distributedToday) : 0;
        if (pending > available) {
            pending = available;
        }

        return info.unclaimedBKT + pending;
    }

    /// @notice Rejects direct ETH transfers except governance-controlled sends.
    receive() external payable {
        require(msg.sender == governance, "Only DAO can send ETH");
    }
}
