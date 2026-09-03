# MiniBank Hardhat 完整測試結果報告

## 1. 測試目標

本次測試目標是跳過前端操作，直接使用 Hardhat 對合約層做完整功能驗證。測試範圍包含部署、權限初始化、LP 流動性、抵押借貸、還款、提款、清算、BKT 獎勵、協議 reserve、DAO governance 與既有 mock flash-loan 情境。

本次也新增一條完整整合測試：

```text
test/comprehensive-onchain-flow-test.js
```

這條測試會在同一個 on-chain flow 中完整跑過主要 protocol 功能，不依賴前端。

## 2. 執行指令與結果

### Compile

```bash
npm run compile
```

結果：

```text
Nothing to compile
```

### Full Hardhat Test Suite

```bash
npm test
```

結果：

```text
24 passing (1s)
```

## 3. 新增完整整合測試覆蓋範圍

| 模組 | 測試內容 | 結果 |
| --- | --- | --- |
| 合約部署 | 部署 `PriceOracle`、`MiniDAI`、`BankToken`、`aMDAI`、`BankV3`、`BankTimelock`、`BankGovernor` | Passed |
| 權限初始化 | `MiniDAI.minter = BankV3`、`aMDAI.bank = BankV3`、`BankV3.governance = Timelock` | Passed |
| BKT 分配 | BKT 分配給 Timelock、BankV3，並保留 deployer 投票能力 | Passed |
| LP supply | LP1 / LP2 供應 mDAI，取得 aMDAI | Passed |
| LP share view | 驗證 `getLPInfo`、`getExchangeRate`、aMDAI total supply | Passed |
| 抵押 | Borrower 存入 ETH 抵押品 | Passed |
| 借款 | Borrower 借出 mDAI，債務與 mDAI balance 增加 | Passed |
| 利息 | 快轉時間後債務增加 | Passed |
| 還款 | 部分還款，驗證債務下降與 protocol token reserve 增加 | Passed |
| 最大可提款 | 驗證 `getMaxWithdrawableETH` | Passed |
| 提款 | 提出部分 ETH，驗證 collateral state 下降 | Passed |
| LP reward | 快轉時間後 LP reward 增加並可 claim | Passed |
| Borrower reward | 快轉時間後 borrower reward 增加並可 claim | Passed |
| Oracle 改價 | 調低 ETH price 讓 borrower 進入可清算狀態 | Passed |
| Health Factor | 驗證 HF 低於 liquidation threshold | Passed |
| 清算估算 | 呼叫 `estimateMaxLiquidate`、`getLiquidationPrice` | Passed |
| 清算 | Liquidator 代還 mDAI，取得 ETH，borrower collateral/debt 下降 | Passed |
| LP redeem | LP redeem aMDAI，取回 mDAI | Passed |
| DAO delegate | Deployer delegate BKT voting power 給自己 | Passed |
| DAO propose | 建立多 call governance proposal | Passed |
| DAO vote | proposal 進入 Active 後投 For | Passed |
| DAO queue | proposal Succeeded 後 queue 到 Timelock | Passed |
| DAO execute | 快轉 Timelock 後 execute | Passed |
| Governance parameters | 更新 interest rate、daily cap、reserve factor、max total debt、reward ratios | Passed |
| Governor parameters | 更新 proposal threshold、quorum setting | Passed |
| Reserve operation | 透過 DAO 執行 `injectProtocolEarningsToLP` 與 `withdrawTokenReserve` | Passed |
| Status operation | 透過 DAO 執行 `changeStatus(PAUSED)` 再切回 `STARTED` | Passed |
| View/debug functions | 呼叫 reward preview、interest preview、debt debug views | Passed |

## 4. 既有測試覆蓋範圍

| 測試檔案 | 覆蓋內容 | 結果 |
| --- | --- | --- |
| `BankV3-test.js` | 抵押、借款、利息、清算、還清債務、提款限制 | Passed |
| `repay-test.js` | 還款拆分本金、LP 收益、protocol reserve | Passed |
| `lp-supply-test.js` | LP supply/redeem、多使用者、aMDAI 與 reward | Passed |
| `liquidation-test.js` | 清算流程、清算後債務與抵押品變化 | Passed |
| `liquidation-lp-test.js` | 多 LP 情境下清算與 LP reward | Passed |
| `interest-test.js` | 清算時 LP 收益與 reserve 增加 | Passed |
| `reward-test.js` | Borrower / LP reward 累積與領取 | Passed |
| `reward-test-liquidation-withdrawal.js` | 清算、提款、dailyCap 與 reward base 邊界 | Passed |
| `flashLoanMock.js` | Flash-loan liquidation mock 成功與失敗情境 | Passed |
| `comprehensive-onchain-flow-test.js` | 完整 protocol + DAO on-chain 整合流程 | Passed |

## 5. 本次已修正項目

| 項目 | 狀態 |
| --- | --- |
| `CollateralWithdrawn` event | 已在 `withdrawCollateral` 成功後 emit |
| `Borrowed` event | 已在 `borrow` 成功後 emit |
| `hardhat/console.sol` | 已從合約移除，合約內沒有 `console.log` |
| aMDAI mint | 已改為依 exchange-rate mint shares |
| Borrower reward base | 已改為依 outstanding debt，而不是 ETH collateral |
| Health Factor | 已改為 `collateralValue * liquidationThreshold / debt`，清算線為 HF < 1 |
| Liquidation bonus | 已由 30% 降為 10% |
| Oracle setPrice | 已加上 `onlyOwner` 權限 |

## 6. 仍需注意的限制

### 6.1 `withdrawETHReserve` 未納入正常 happy path 測試

目前清算流程會把 ETH collateral 直接給 liquidator，`protocolETHReserve` 在正常流程中沒有增加。因此 `withdrawETHReserve` 沒有自然可提領的 ETH reserve 來源。

影響：此函式存在，但目前 protocol flow 不會產生可用的 ETH reserve。

建議釐清：若協議要有 ETH reserve，清算流程需要明確把部分 ETH 計入 `protocolETHReserve`；若不需要，應移除此函式或標示為未使用。

### 6.2 破壞性治理函式未放入完整 happy path

`transferGovernance`、`setGovernance`、`lockGovernance` 會改變後續治理權限或永久鎖定治理，因此沒有放在主要整合 happy path 中執行。完整整合測試已驗證 Timelock governance 可以正常控制參數與 protocol actions。

## 7. 最終結論

本次 Hardhat 合約層完整測試通過：

```text
24 passing
```

MiniBank 目前的核心 on-chain 功能可以在不依賴前端的情況下完整跑通：LP 供應、抵押借貸、利息、還款、提款、清算、reward claim、reserve 操作與 DAO governance 都已被測試覆蓋。

目前剩餘較值得優先處理的是前端同步與更進階的協議模型：

```text
1. 將前端 HF 風險文案同步成 HF < 1
2. 修正前端 liquidation event parser
3. 釐清 `protocolETHReserve` / `withdrawETHReserve` 是否要保留
4. 將破壞性 governance 操作另外拆成 isolated tests
5. 中長期實作 utilization-based interest rate
```
