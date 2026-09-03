# MiniBank DeFi 借貸專案診斷報告

## 1. 報告定位

本報告已依目前版本重新對齊。MiniBank 現在已不是單純表單式 demo，而是具備本地借貸協議、治理流程與專業化前端 Console 的 DeFi lending prototype。

建議作品定位：

```text
MiniBank: A professional DeFi lending protocol console for local/testnet environments.
```

中文定位：

```text
MiniBank：專業化 DeFi 借貸協議控制台，支援本地與測試網展示。
```

本專案不應包裝成可處理真實資金的主網產品。較成熟的說法是：它是一個 production-like prototype，用來展示 DeFi lending 的抵押、借款、利息、清算、reward emission、LP share、DAO governance 與 protocol monitoring 能力。

## 2. 目前版本現況

### 2.1 已完成能力

| 模組 | 目前狀態 |
| --- | --- |
| 抵押借貸 | 使用 ETH 作為抵押品，依 LTV 借出 mDAI |
| LP 流動性池 | LP 供應 mDAI，取得 aMDAI share，並可依池子比例 redeem |
| 還款與利息 | 還款會拆成本金、LP 收益與協議 reserve |
| 清算 | HF 低於清算門檻時，清算人可代還 mDAI 並取得 ETH 抵押品獎勵 |
| BKT 獎勵 | LP 與 Borrower 可累積、預覽並領取 BKT，並有 daily cap |
| DAO 治理 | 使用 `BankGovernor`、`BankTimelock`、`BankToken` 串接治理提案流程 |
| Governance 參數 | 支援調整利率、reward ratio、daily cap、reserve factor、max debt、proposal threshold、quorum 等 |
| 前端 Console | 已改成 Overview、Markets、Portfolio、Risk、Liquidations、Governance、Analytics、Parameters 分頁 |
| 風險面板 | 顯示 Health Factor、清算價格、最大可提款、風險狀態條 |
| 清算監控 | 前端會從事件抓 active users，顯示清算 watchlist 與 max repay |
| 事件分析 | 前端已有 Recent Activity，讀取多種 BankV3 event |
| Network Guard | 前端會檢查並切換到 Hardhat localhost `chainId 31337` |
| 文件 | 已有 `README.md`、`DEMO_FLOW.md`、`PROJECT_DIAGNOSTIC_REPORT.md`、`PORTFOLIO_WRITEUP.md`、`PRESENTATION_CHECKLIST.md`、`ADMISSIONS_APPLICATION_GUIDE.md` |
| 測試 | `npm test` 目前結果為 `24 passing` |

### 2.2 目前指令

| 指令 | 用途 |
| --- | --- |
| `npm run compile` | 編譯 Solidity 合約 |
| `npm test` | 執行 Hardhat 測試 |
| `npm run node` | 啟動 Hardhat localhost chain |
| `npm run deploy:local` | 部署合約並輸出 ABI/address 到 `frontend/` |
| `npm run fund:local` | 發 20,000 mDAI 給 Account #1 到 #4 |
| `npx serve frontend` | 啟動靜態前端 |

### 2.3 目前合約架構

| 合約 | 角色 |
| --- | --- |
| `BankV3.sol` | 核心借貸、LP、還款、清算、reward、reserve 與治理參數 |
| `MiniDAI.sol` | 本地測試穩定幣 mDAI，owner 或 Bank minter 可 mint/burn |
| `aMDAI.sol` | LP share token，只有 Bank 可 mint/burn |
| `BankToken.sol` | BKT 治理與獎勵 token，基於 ERC20Votes，一次性鑄造 |
| `BankGovernor.sol` | OpenZeppelin Governor + Votes + TimelockControl |
| `BankTimelock.sol` | TimelockController 包裝合約 |
| `PriceOracle.sol` | 本地測試用可調 ETH/USD Oracle |

## 3. 完整展示流程

### 3.1 啟動流程

第一個終端機啟動本地鏈：

```bash
npm run node
```

第二個終端機部署合約：

```bash
npm run deploy:local
```

發放測試 mDAI：

```bash
npm run fund:local
```

啟動前端：

```bash
npx serve frontend
```

瀏覽器打開：

```text
http://localhost:3000
```

MetaMask 使用：

```text
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
Currency: ETH
```

### 3.2 建議帳號分工

| 帳號 | 用途 |
| --- | --- |
| Account #0 | 部署者、DAO 提案、投票、治理展示 |
| Account #1 | LP，供應 mDAI 流動性 |
| Account #2 | Borrower，抵押 ETH 並借 mDAI |
| Account #3 | Liquidator，清算高風險帳戶 |

`npm run fund:local` 會讓 Account #1 到 #4 各取得 20,000 mDAI。

### 3.3 展示主線

1. 連接 MetaMask，確認 Network Guard 顯示 Hardhat Localhost `31337`。
2. 在 `Overview` 看 TVL、Total Borrowed、Available Liquidity、Borrow APR、Supply APR、Protocol Reserve。
3. 切到 Account #1，在 `Portfolio` 或 LP 區供應 5,000 mDAI，取得 aMDAI。
4. 到 `Markets` 說明目前只有 ETH/mDAI 單一 lending market，並展示 LTV、清算門檻、bonus、reserve factor。
5. 切到 Account #2，抵押 2 ETH，借出 1,000 mDAI。
6. 到 `Portfolio` 看 Collateral Value、Debt、Available Borrow、Health Factor、Liquidation Price、Max Withdrawable。
7. 在還款區先還 100 mDAI，說明還款會拆成本金、LP 收益與 protocol reserve。
8. 在清算價格區把 ETH 價格調低，例如 400 USD。
9. 到 `Liquidations` 更新 watchlist，確認 Account #2 進入高風險或可清算狀態。
10. 切到 Account #3，選擇 watchlist 的 borrower，approve mDAI 後執行 liquidation。
11. 回到 `Overview` 與 `Analytics`，展示 reserve、liquidity、Recent Activity 的變化。
12. Account #1 與 Account #2 等待或快轉時間後，分別領取 LP / Borrower BKT reward。
13. 切回 Account #0，在 `Governance` 委託投票權給自己，建立調整利率或 daily cap 的提案。
14. Mine block 讓提案進入投票期，投票後再 mine 直到投票結束。
15. Queue 提案，快轉 timelock 20 秒，最後 execute，確認參數變更反映到 `Parameters`。

### 3.4 DAO 快轉指令

讓提案進入投票期：

```bash
node -e "const { ethers } = require('ethers'); (async()=>{const p=new ethers.JsonRpcProvider('http://127.0.0.1:8545'); await p.send('evm_mine',[]); console.log('mined 1 block');})();"
```

結束投票期：

```bash
node -e "const { ethers } = require('ethers'); (async()=>{const p=new ethers.JsonRpcProvider('http://127.0.0.1:8545'); for(let i=0;i<5;i++) await p.send('evm_mine',[]); console.log('mined 5 blocks');})();"
```

快轉 Timelock：

```bash
node -e "const { ethers } = require('ethers'); (async()=>{const p=new ethers.JsonRpcProvider('http://127.0.0.1:8545'); await p.send('evm_increaseTime',[25]); await p.send('evm_mine',[]); console.log('timelock passed');})();"
```

## 4. 與成熟 DeFi 借貸協議的差異

### 4.1 市場與資產模型

| 項目 | MiniBank 目前狀態 | Aave / Compound 類協議 |
| --- | --- | --- |
| 抵押資產 | ETH 單一抵押品 | 多資產市場 |
| 借款資產 | mDAI 單一借款資產 | 多資產可供應與借款 |
| 風險參數 | 全域 LTV、清算門檻、bonus、reserve factor | 每個市場獨立風險參數 |
| LP share | aMDAI share，redeem 時依 pool/share 比例換回 | aToken / cToken 使用 index 或 exchange rate 精細會計 |
| 穩定幣 | 自製 MiniDAI | 外部穩定幣或嚴格鑄造控制 |

### 4.2 利率模型

| 項目 | MiniBank 目前狀態 | 成熟協議 |
| --- | --- | --- |
| Borrow APR | 固定利率，可由治理調整 | 依 utilization 動態調整 |
| Supply APR | 前端以 borrow APR、utilization、reserve factor 推估 | 由 index accounting 精準累積 |
| 利息累積 | 使用者互動或 view 時依 elapsed time 計算 | 使用 borrow index / supply index |
| 測試時間 | `SECONDS_PER_YEAR = 60` 以及多處用 1 day 模擬快速利息 | 真實年化時間尺度 |

### 4.3 Oracle 與價格風險

| 項目 | MiniBank 目前狀態 | 成熟協議 |
| --- | --- | --- |
| 價格來源 | `PriceOracle` 可手動 `setPrice` | Chainlink、TWAP、多重 Oracle |
| 權限 | `setPrice` 已加 `onlyOwner` | 僅可信 feed、keeper 或治理 |
| 風險檢查 | 無 staleness / deviation check | 檢查過期、異常跳動、fallback |

本地 demo 需要可改價來展示清算，所以保留可調價格是合理的。目前已限制只有 owner 可改價；下一步可把合約命名調整為 `MockPriceOracle`，讓語意更清楚。

### 4.4 清算與 Health Factor

| 項目 | MiniBank 目前狀態 | 成熟協議 |
| --- | --- | --- |
| HF 公式 | `collateralValue * liquidationThreshold / debt` | 通常 `collateralValue * liquidationThreshold / debt` |
| 清算判斷 | `HF < 1`，以 `DECIMALS = 10000` 表示 | 通常標準化為 HF < 1 |
| 清算比例 | 單次最多 50% principal，且受抵押品價值限制 | close factor、bonus、protocol fee 依市場設定 |
| 清算獎勵 | 10% bonus | 通常較保守且依資產調整 |

目前版本已改成較標準的 HF 表達方式，但仍是單一資產 prototype，尚未處理多市場與壞帳模型。

### 4.5 Governance

| 項目 | MiniBank 目前狀態 | 成熟 DAO |
| --- | --- | --- |
| Voting delay | 1 block | 通常更長 |
| Voting period | 4 blocks | 通常以天計 |
| Timelock | 20 秒 | 通常 1 到 2 天以上 |
| Quorum | `quorumPercent / 100`，目前預設 2% | 清楚的百分比治理模型 |
| Admin 權限 | 部署腳本在授權 Governor 後撤銷 deployer 的 Timelock admin | 正式 DAO 應避免 EOA 長期保留 admin |

這些設定適合本地展示，但公開作品要明確註記為 demo governance parameters。

## 5. 目前主要風險與不合理處

### 5.1 高優先級

| 問題 | 位置 | 影響 | 建議 |
| --- | --- | --- | --- |
| Mock oracle 僅適合展示 | `PriceOracle.sol` | owner 可手動改價，不可用於真實資金 | 若部署測試網，改接 Chainlink 或 TWAP |
| 單一資產模型 | `BankV3.sol` | 風險參數全域化，無法反映多市場風險 | 後續擴充為 per-market config |

### 5.2 中優先級

| 問題 | 位置 | 影響 | 建議 |
| --- | --- | --- | --- |
| `totalDebtCached` 不是完整即時總債務 | Dashboard / utilization | 未互動用戶的利息不一定納入 aggregate | 文件標示或改成 index-based accounting |
| BKT reward pool 可能耗盡 | `claimReward` | Bank 只持有初始分配的 BKT | 前端已顯示預算，進階可加剩餘 reward pool 警示 |

### 5.3 低優先級

| 問題 | 影響 | 建議 |
| --- | --- | --- |
| 測試輸出仍有部分 test-side console message | 測試報告可讀性普通 | 視需要整理 test log |
| `rewardRatio` 已偏 legacy | 參數語意重疊 | 若不用可移除或標示 deprecated |
| 測試預設靜默 debug log | 一般測試輸出更乾淨 | 需要詳細輸出時設定 `DEBUG_TESTS=1` |

## 6. 下一階段優化路線

### P0：展示穩定性

| 項目 | 狀態 |
| --- | --- |
| 測試可跑 | 已完成，`24 passing` |
| 本地部署腳本 | 已完成 |
| fund script | 已完成 |
| README / Demo Flow | 已完成 |
| Network Guard | 已完成 |
| Console 分頁前端 | 已完成 |

### P1：清理目前版本的明顯技術債

| 項目 | 原因 |
| --- | --- |
| 將 `PriceOracle` 檔名與合約名正式改為 `MockPriceOracle` | 目前已在文件與 NatSpec 標示為 mock；進一步改名可讓語意更乾淨 |
| 將前端 HF 風險文案同步成 HF < 1 | 對齊新的標準 HF 模型 |

### P2：核心模型升級

| 項目 | 原因 |
| --- | --- |
| utilization-based borrow APR | 更接近真實 lending market |
| index-based accounting | 更準確追蹤全局 debt 與 LP 收益 |

### P3：安全性與工程品質

| 項目 | 原因 |
| --- | --- |
| invariant tests | 驗證資產會計不被破壞 |
| Slither | 靜態分析安全風險 |
| npm audit 處理或說明 | 避免展示時被問倒 |

### P4：公開展示能力

| 項目 | 原因 |
| --- | --- |
| Sepolia deployment | 讓審查者不用本地鏈也能看互動 |
| Chainlink testnet oracle | 提升價格來源可信度 |
| Etherscan verify | 增加作品可信度 |
| Hosted frontend | 降低展示門檻 |

## 7. 推甄呈現建議

建議作品標題：

```text
MiniBank: Professional DeFi Lending Protocol Console
```

中文：

```text
MiniBank：專業化 DeFi 借貸協議控制台
```

作品摘要：

```text
MiniBank 是一個 local/testnet DeFi lending prototype，實作 ETH 抵押、mDAI 借貸、LP 流動性、清算、BKT 獎勵與 DAO 治理。前端以 protocol console 形式呈現 Overview、Markets、Portfolio、Risk、Liquidations、Governance、Analytics 與 Parameters，重點是展示 DeFi lending 的資產流、風險模型、清算流程與治理機制。
```

面試時可主動說明：

```text
我沒有把它包裝成可處理真實 ETH 的協議，因為真正 DeFi 上線需要安全 Oracle、動態利率、index accounting、完整風控與審計。目前版本定位為 professional prototype，目標是完整展示 DeFi lending 的核心機制與工程思考。
```

## 8. 總結

MiniBank 目前已具備完整本地展示能力：合約流程完整、前端已升級為專業 Console、文件與測試可支撐推甄展示。下一步不需要再加教學式 demo，而應集中在清理技術債與提升協議模型可信度。

最建議優先處理的五件事：

```text
1. 移除 hardhat/console.sol 與 debug log
2. 補 Borrowed event 並修正 Analytics 完整性
3. 修正前端 liquidation event parser
4. 將 PriceOracle 明確改為 MockPriceOracle 並加權限
5. 升級 aMDAI mint 為 exchange-rate share accounting
```
