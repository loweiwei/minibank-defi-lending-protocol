# MiniBank 推甄資料寫法指南

這份文件整理 MiniBank 專題在研究所推甄資料中的寫法。內容可用於履歷、作品集、自傳、讀書計畫、面試簡報與口頭回答。

使用原則：不要把它包裝成主網可用產品，而是定位成「完整 DeFi lending protocol prototype」。重點放在協議設計、風險模型、smart contract 工程、測試驗證與後續研究方向。

## 1. 一句話版本

適合放在履歷、作品列表或簡報第一頁：

> MiniBank 是一個基於 Hardhat 與 Solidity 的 DeFi 借貸協議 prototype，實作 ETH 抵押、mDAI 借款、LP 流動性、清算、BKT 獎勵與 DAO governance，並串接完整前端 console 與測試流程。

更精簡版本：

> MiniBank：完整串接 smart contract、DAO governance、測試與前端的 DeFi lending protocol prototype。

偏研究取向版本：

> MiniBank 以 DeFi lending 為主題，實作抵押借貸、清算風險控制與 DAO 參數治理，用於探索鏈上金融協議的設計、驗證與安全限制。

## 2. 履歷作品欄寫法

適合放在履歷的「專題作品」或「Projects」區塊：

```text
MiniBank DeFi Lending Protocol Prototype
技術：Solidity, Hardhat, OpenZeppelin, ethers.js, JavaScript, MetaMask

實作一個 DeFi 借貸協議 prototype，支援 ETH 抵押借出 mDAI、LP 供應流動性取得 aMDAI share、health factor 與 liquidation、BKT reward emission，以及 ERC20Votes + Governor + Timelock 的 DAO governance。專案包含 smart contracts、Hardhat tests、部署腳本、前端 protocol console 與展示文件。測試覆蓋借款、還款、清算、LP、reward 與 governance proposal flow，共 24 passing。
```

如果履歷空間較小，可以改成：

```text
MiniBank DeFi Lending Protocol Prototype | Solidity, Hardhat, OpenZeppelin, ethers.js
實作 ETH 抵押借款、LP liquidity pool、清算、BKT rewards 與 DAO governance；完成合約、測試、部署腳本與前端 console，Hardhat tests 24 passing。
```

## 3. 作品集段落寫法

適合放在作品集 PDF 或 GitHub README 前言：

```text
MiniBank 是我以 DeFi lending protocol 為主題完成的區塊鏈專題。此作品不是單純的表單式 DApp，而是從 smart contract、資產流、風險控制、DAO governance、測試與前端互動完整串接的 lending prototype。

在功能上，使用者可以抵押 ETH，依 LTV 借出 mDAI；LP 可以供應 mDAI 並取得 aMDAI share；當借款人的 health factor 低於門檻時，清算人可以代還 mDAI 並取得 ETH 抵押品獎勵。系統同時支援 BKT reward emission 與 ERC20Votes + Governor + Timelock 的治理流程，使協議參數可以透過 DAO proposal 更新。

在工程面，我使用 Hardhat 建立測試與部署流程，並以 OpenZeppelin ReentrancyGuard、SafeERC20、ERC20Votes、Governor、TimelockController 等模組強化合約可靠性。前端則以 ethers v6 串接 MetaMask，提供 protocol console 展示資產狀態、風險指標、清算名單、治理操作與事件紀錄。
```

## 4. 自傳可用段落

適合放在自傳或學習歷程中，語氣較偏個人動機：

```text
我對區塊鏈技術的興趣不只停留在代幣轉帳或簡單 DApp，而是希望理解鏈上金融協議如何透過程式碼管理資產、風險與治理。因此我完成了 MiniBank DeFi Lending Protocol Prototype，嘗試實作一個具備 ETH 抵押、mDAI 借款、LP 流動性、清算、獎勵發放與 DAO governance 的借貸系統。

在開發過程中，我學習到 DeFi lending protocol 的核心並不只是「借出與還款」，更重要的是抵押率、health factor、liquidation threshold、reserve factor、oracle price 與 governance 權限之間的關係。透過撰寫 Hardhat tests，我驗證了借款、還款、清算、LP share、reward emission 與 DAO proposal flow 等情境，也更理解 smart contract 中資產會計與安全檢查的重要性。

這個專題讓我把 Solidity、OpenZeppelin、Hardhat、ethers.js 與前端整合串成完整作品，也讓我看見目前 prototype 與成熟 DeFi 協議之間仍有差距，例如多資產市場、動態利率模型、oracle 安全與 index-based accounting。這些限制也成為我未來在研究所希望深入探討的方向。
```

## 5. 讀書計畫可用段落

適合放在「研究興趣」、「未來研究方向」、「入學後計畫」：

```text
未來若有機會進入研究所，我希望延續 MiniBank 專題中累積的基礎，進一步研究區塊鏈金融協議的安全性與機制設計。MiniBank 目前是一個 local/testnet prototype，已完成抵押借貸、清算、reward emission 與 DAO governance，但仍保留固定利率、單一資產、mock oracle 與簡化 LP 會計等限制。

後續我希望從三個方向深化。第一，將固定利率模型升級為 utilization-based interest rate model，使借款利率能隨資金池使用率動態調整。第二，導入 index-based accounting，更精準地追蹤 borrower debt 與 LP yield，接近 Aave 或 Compound 類協議的會計模型。第三，強化 oracle 與安全驗證，包含 Chainlink 或 TWAP oracle、staleness/deviation checks、invariant testing、fuzz testing 與靜態分析工具。

我期待能在研究所中結合分散式系統、密碼學、金融科技與軟體工程方法，進一步研究可信任鏈上金融系統的設計與驗證。
```

## 6. 面試 1 分鐘介紹

適合教授問「請介紹一下這個專題」時使用：

```text
我的專題 MiniBank 是一個 DeFi lending protocol prototype，目標是模擬 Aave 或 Compound 類借貸協議的核心流程。使用者可以抵押 ETH，依 LTV 借出 mDAI；LP 可以供應 mDAI 並取得 aMDAI share；當 borrower 的 health factor 低於 1 時，清算人可以代還 mDAI 並取得 ETH 抵押品獎勵。

除了基本借貸，我也實作了 BKT reward emission 與 DAO governance。BKT 使用 ERC20Votes，治理流程透過 Governor 和 Timelock 執行，可以調整利率、daily cap、reserve factor 等參數。工程上，我使用 Hardhat 撰寫測試與部署腳本，前端用 ethers v6 串接 MetaMask，提供一個 protocol console 觀察帳戶資料、風險指標、清算名單與治理操作。

這個作品的重點不是宣稱可上主網，而是展示我對 DeFi lending 的風險模型、smart contract 工程、測試驗證與治理流程的理解。
```

## 7. 面試 3 分鐘介紹

適合需要完整說明作品時使用：

```text
MiniBank 是我完成的一個 DeFi lending protocol prototype。我選擇借貸協議作為主題，是因為它結合 smart contract、金融風險模型、oracle、清算機制與 DAO governance，比單純代幣或 NFT DApp 更能展示區塊鏈系統設計能力。

系統分成幾個部分。第一是核心合約 BankV3，負責 ETH 抵押、mDAI 借款、還款、清算、LP supply/redeem、protocol reserve 與 reward accounting。第二是 token 模組，包含 MiniDAI 作為測試穩定幣、aMDAI 作為 LP share token、BKT 作為 reward 與 governance token。第三是 DAO 模組，使用 OpenZeppelin ERC20Votes、Governor 與 TimelockController，讓參數調整需要經過提案、投票、queue 與 execute。第四是前端 protocol console，讓使用者可以透過 MetaMask 操作借貸、清算、reward 與治理流程。

我在這個專題中實作了幾個 DeFi lending 的核心概念。借款額度由 collateral value 和 LTV 決定；清算由 health factor 判斷；還款會拆成本金、LP 收益與 protocol reserve；LP 透過 aMDAI 表示資金池 share；reward emission 受到 daily cap 限制。這些設計讓我更理解鏈上金融協議如何把風險控制寫成可驗證的規則。

工程品質方面，我使用 ReentrancyGuard、SafeERC20、ETH call transfer，並在部署腳本中撤銷 deployer 的 timelock admin 權限，讓治理控制更接近正式協議。測試方面，我撰寫 Hardhat tests 覆蓋借款、還款、清算、LP、reward 與 DAO proposal flow，目前測試為 24 passing。

目前 MiniBank 仍是 prototype，有 mock oracle、固定利率、單一資產與簡化 LP accounting 等限制。我沒有把這些包裝成正式產品，而是在 diagnostic report 中揭露，並規劃後續研究方向，例如 utilization-based interest rate、index-based accounting、多資產市場、Chainlink oracle、fuzz testing 與 invariant testing。
```

## 8. 教授可能問的問題與回答

### Q1：這和一般 DApp 有什麼不同？

```text
一般 DApp 可能只處理單一功能，例如轉帳或表單互動。MiniBank 的重點是協議設計，它包含資產流、風險參數、清算條件、reward emission 與 DAO governance。也就是說，我不只做前端按鈕，而是把 DeFi lending protocol 的核心規則寫進 smart contract，並透過測試驗證主要流程。
```

### Q2：為什麼需要清算？

```text
在抵押借貸中，借款人抵押品價值可能因價格下跌而不足以覆蓋債務。清算機制讓第三方可以代替高風險借款人償還部分債務，並取得抵押品獎勵，藉此降低協議壞帳風險。MiniBank 使用 health factor 判斷是否可清算，當 HF 低於 1 時即可清算。
```

### Q3：你的 oracle 安全嗎？

```text
目前 PriceOracle 是 mock oracle，只有 owner 可以手動改價，目的是在本地展示清算流程。它不適合主網。正式版本應該導入 Chainlink、TWAP 或多重 oracle，並加入 staleness check、deviation check 與 fallback 機制。這也是我在文件中列出的後續研究方向。
```

### Q4：這個系統可以上主網嗎？

```text
目前不適合直接上主網。它是 production-like prototype，用來展示 lending protocol 的核心邏輯與工程整合。距離主網產品還需要安全審計、fuzz testing、invariant testing、正式 oracle、多資產風險模型、完整權限隔離與更精準的會計模型。
```

### Q5：你做 DAO governance 的意義是什麼？

```text
DeFi 協議中的利率、reserve factor、reward cap 等參數會影響所有使用者，不應該由單一帳號隨意修改。因此我使用 ERC20Votes、Governor 與 Timelock，讓參數調整需要經過提案、投票、queue 與延遲執行。這可以展示協議參數治理與權限管理的概念。
```

### Q6：你最大的收穫是什麼？

```text
我最大的收穫是理解 DeFi lending 的核心不只是完成借款功能，而是要處理資產會計、風險參數、清算誘因、oracle 假設與治理權限。這也讓我意識到 smart contract 工程需要同時考慮正確性、安全性、可測試性與文件化。
```

## 9. 不建議的寫法

避免以下說法，因為容易被教授追問或顯得誇大：

| 不建議寫法 | 問題 |
| --- | --- |
| 我完成了一個可上主網的 DeFi 銀行 | 目前是 prototype，不能宣稱主網可用 |
| 我做了一個像 Aave 一樣的完整協議 | MiniBank 是簡化模型，不是完整 Aave clone |
| 這個系統很安全 | 沒有 audit、fuzzing、formal verification，不能這樣說 |
| Oracle 可以準確反映市場價格 | 目前是 mock oracle，只適合 demo |
| 使用者可以無風險借貸 | DeFi lending 本身有清算、oracle、流動性與 smart contract 風險 |

建議改成：

| 較佳寫法 | 原因 |
| --- | --- |
| production-like prototype | 強調工程完整但不誇大 |
| 展示 DeFi lending 核心流程 | 精準描述範圍 |
| 明確揭露限制與後續方向 | 表現風險意識與研究潛力 |
| 已完成本地測試與展示流程 | 可驗證、可信 |

## 10. 推甄資料推薦放法

### 履歷

放在「專題作品」區，使用 3 到 5 行描述，重點列技術與成果。

建議包含：

| 欄位 | 內容 |
| --- | --- |
| 專題名稱 | MiniBank DeFi Lending Protocol Prototype |
| 技術 | Solidity, Hardhat, OpenZeppelin, ethers.js, MetaMask |
| 功能 | ETH collateral, mDAI borrowing, LP pool, liquidation, rewards, DAO governance |
| 驗證 | Hardhat tests 24 passing |

### 自傳

放在「學習動機」或「專題經驗」段落，強調你為什麼做 lending protocol，以及你學到什麼。

### 讀書計畫

放在「未來研究方向」，接到 utilization-based interest rate、oracle security、fuzz testing、DeFi protocol verification。

### 作品集 PDF

建議用 4 頁呈現：

| 頁面 | 內容 |
| --- | --- |
| 第 1 頁 | 專題動機、系統定位、技術 stack |
| 第 2 頁 | 架構圖、合約模組、主要流程 |
| 第 3 頁 | 測試結果、前端截圖、demo flow |
| 第 4 頁 | 限制、與成熟協議差異、未來研究方向 |

## 11. 可直接貼到作品集的摘要

```text
MiniBank 是一個 DeFi lending protocol prototype，完整實作 ETH 抵押、mDAI 借款、LP 流動性池、清算、BKT reward emission 與 DAO governance。專案使用 Solidity、Hardhat、OpenZeppelin、ethers.js 與 MetaMask，並包含 smart contracts、測試、部署腳本、前端 protocol console 與展示文件。

此專題的核心在於把 DeFi lending 的資產流與風險控制具體化：借款額度由 LTV 決定，清算由 health factor 觸發，還款會拆分為本金、LP 收益與 protocol reserve，治理參數則透過 ERC20Votes、Governor 與 Timelock 調整。測試覆蓋借款、還款、LP、清算、reward 與 DAO proposal flow，目前 Hardhat tests 為 24 passing。

本作品定位為 local/testnet prototype，不宣稱可直接上主網。後續可延伸到 utilization-based interest rate、index-based accounting、多資產市場、Chainlink oracle、fuzz testing 與 invariant testing。
```

## 12. 最終建議標題

可依場合使用不同標題：

| 場合 | 標題 |
| --- | --- |
| GitHub | MiniBank DeFi Lending Protocol |
| 履歷 | MiniBank DeFi Lending Protocol Prototype |
| 作品集 | MiniBank：具備清算與 DAO 治理的 DeFi 借貸協議原型 |
| 面試簡報 | MiniBank: DeFi Lending, Liquidation, Rewards and DAO Governance |
| 研究計畫 | 鏈上借貸協議之風險控制、清算機制與治理模型實作 |
