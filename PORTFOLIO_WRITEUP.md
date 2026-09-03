# MiniBank 推甄作品說明

## 作品定位

MiniBank 是一個基於 Hardhat 的 DeFi 借貸協議 prototype，目標是完整展示去中心化借貸系統的核心機制，而不是宣稱可直接處理主網真實資金。

本作品重點在於把 smart contract、測試、DAO governance、前端 console 與 demo 文件整合成一個可展示、可驗證的完整系統。

## 解決問題

傳統金融借貸需要中心化機構管理抵押品、放款、風險評估與清算。DeFi lending 則把這些規則寫入 smart contract，由鏈上狀態與價格資料決定使用者可借額度、健康因子與清算條件。

MiniBank 透過 ETH 抵押、mDAI 借款與 liquidation flow，展示這類協議的基本設計。

## 核心功能

| 模組 | 說明 |
| --- | --- |
| 抵押借款 | 使用者存入 ETH，依 LTV 借出 mDAI |
| LP 流動性 | LP 供應 mDAI，取得 aMDAI share，可依池子比例 redeem |
| 利息與 reserve | 還款拆成本金、LP 收益與 protocol reserve |
| 清算 | Health Factor 低於 1 時，清算人代還 mDAI 並取得 ETH bonus |
| Reward emission | LP 與 Borrower 依時間與資金基礎累積 BKT，並有 daily cap |
| DAO governance | BKT 持有人可透過 Governor + Timelock 調整協議參數 |
| 前端 console | 提供帳戶資料、風險監控、清算 watchlist、治理操作與事件紀錄 |

## 技術架構

| 層級 | 技術 |
| --- | --- |
| Smart Contract | Solidity 0.8.20、OpenZeppelin Contracts |
| Development | Hardhat、hardhat-toolbox、hardhat-tracer |
| Governance | ERC20Votes、Governor、TimelockController |
| Frontend | 靜態 HTML/CSS/JavaScript、ethers v6、MetaMask |
| Testing | Hardhat test、Chai、EVM time/block manipulation |

## 工程品質

本作品不只實作 happy path，也補上多個工程面考量：

| 類別 | 實作內容 |
| --- | --- |
| 安全呼叫 | ERC20 操作使用 `SafeERC20`，ETH 發送使用 `call` 並檢查結果 |
| 重入防護 | 涉及資產轉出的核心函式使用 `nonReentrant` |
| 權限控制 | 協議參數由 governance/timelock 控制，部署腳本撤銷 deployer timelock admin，oracle 餵價限制 owner |
| 風險模型 | 支援 LTV、liquidation threshold、bonus、reserve factor、max debt |
| 測試覆蓋 | 覆蓋 LP、借款、還款、清算、reward、DAO proposal flow |
| 文件化 | README、demo flow、diagnostic report 與此推甄說明文件 |

## 測試與驗證

目前測試涵蓋完整 on-chain flow：

1. 部署 oracle、mDAI、BKT、aMDAI、BankV3、Timelock、Governor。
2. LP 供應 mDAI 並取得 aMDAI。
3. Borrower 抵押 ETH 並借出 mDAI。
4. 快轉時間驗證利息與 reward 累積。
5. 還款並驗證本金、LP 收益、protocol reserve 拆分。
6. 調低 ETH 價格觸發 liquidation。
7. 執行 DAO proposal、vote、queue、execute，驗證參數更新。

執行方式：

```bash
npm test
```

## 與成熟協議的差異

MiniBank 是 prototype，因此刻意保留以下限制並在文件中揭露：

| 項目 | MiniBank | Aave / Compound 類協議 |
| --- | --- | --- |
| 資產種類 | 單一 ETH 抵押、單一 mDAI 借款 | 多市場、多資產 |
| Oracle | 本地 mock oracle，可手動改價 | Chainlink、TWAP、fallback oracle |
| 利率模型 | 固定利率，由 governance 調整 | 依 utilization 動態變化 |
| LP 會計 | aMDAI share + pool exchange rate | index-based accounting |
| Governance | demo delay/period | 正式長週期治理與 timelock |

這些限制是後續研究與升級方向，而不是未揭露的缺陷。

## 學習成果

透過此作品，我完整練習了以下能力：

1. Solidity 合約設計與 OpenZeppelin 套件整合。
2. DeFi lending 的抵押率、健康因子、清算與 reserve 設計。
3. ERC20Votes、Governor、Timelock 的 DAO governance 流程。
4. Hardhat 測試、部署腳本與本地鏈 demo 流程。
5. 前端 DApp 與 MetaMask / ethers v6 串接。
6. 將工程限制、風險與後續方向文件化。

## 後續研究方向

| 優先度 | 方向 |
| --- | --- |
| P1 | 將固定利率升級為 utilization-based interest rate model |
| P1 | 改用 index-based accounting 精準處理 LP 收益與 borrower interest |
| P2 | 支援多抵押品與多借款資產 |
| P2 | 導入 Chainlink 或 TWAP oracle，加入 staleness/deviation checks |
| P3 | 加入更完整的 invariant/fuzz testing 與 security review checklist |

## 一句話作品描述

MiniBank 是一個完整串接 smart contract、DAO governance、測試與前端的 DeFi lending prototype，用來展示我對區塊鏈金融協議設計、風險控制與工程實作的理解。
