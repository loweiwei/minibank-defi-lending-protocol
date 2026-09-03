# MiniBank 展示前檢查清單

## 1. 開始前

確認 Node.js 與 npm 可用：

```bash
node -v
npm -v
```

確認依賴已安裝：

```bash
npm install
```

確認合約與測試正常：

```bash
npm run compile
npm test
```

若需要看測試中的詳細 debug log：

```bash
$env:DEBUG_TESTS="1"; npm test
```

## 2. 啟動本地展示環境

第一個終端機啟動 Hardhat node：

```bash
npm run node
```

第二個終端機部署與發測試幣：

```bash
npm run deploy:local
npm run fund:local
```

第三個終端機啟動前端：

```bash
npx serve frontend
```

瀏覽器開啟：

```text
http://localhost:3000
```

需要前端 debug log 時可開：

```text
http://localhost:3000?debug=1
```

## 3. MetaMask 設定

| 欄位 | 值 |
| --- | --- |
| Network | Hardhat Localhost |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency | `ETH` |

建議匯入 Hardhat node 顯示的前幾個測試帳號，展示分工如下：

| 帳號 | 用途 |
| --- | --- |
| Account #0 | 部署者、Oracle owner、DAO 提案與投票 |
| Account #1 | LP，供應 mDAI |
| Account #2 | Borrower，抵押 ETH 並借 mDAI |
| Account #3 | Liquidator，執行清算 |

## 4. 建議展示順序

1. Overview：展示 TVL、borrowed、liquidity、reserve。
2. Markets：說明目前是 ETH/mDAI 單一市場。
3. Account #1 supply 5,000 mDAI，取得 aMDAI。
4. Account #2 deposit 2 ETH，borrow 1,000 mDAI。
5. Portfolio / Risk：展示 health factor、liquidation price、max withdrawable。
6. Account #2 repay 100 mDAI，說明本金、LP、reserve 拆分。
7. Account #0 將 ETH price 調低到 400 USD。
8. Liquidations：更新 watchlist，確認 borrower 可清算。
9. Account #3 liquidate borrower，展示 seized ETH 與 reserve 變化。
10. Account #1 / #2 claim BKT reward。
11. Account #0 delegate voting power，建立 DAO 提案。
12. Mine block、投票、queue、快轉 timelock、execute。
13. Parameters：確認 governance 參數已更新。

## 5. 推甄口頭說明重點

| 主題 | 建議說法 |
| --- | --- |
| 作品定位 | 這是 local/testnet DeFi lending prototype，不是主網產品 |
| 核心價值 | 完整串接 lending、liquidation、reward、DAO、frontend console |
| 安全意識 | 使用 ReentrancyGuard、SafeERC20、ETH call、Timelock governance |
| 風險揭露 | Mock oracle、固定利率、單一資產、demo governance 參數 |
| 未來方向 | utilization-based rate、index accounting、多資產、Chainlink oracle、fuzz testing |

## 6. 展示失敗排查

| 狀況 | 檢查 |
| --- | --- |
| 前端顯示 no contract | 是否重啟 node 後忘記 `npm run deploy:local` |
| MetaMask 交易失敗 | 是否切到 chainId 31337 |
| Account 沒有 mDAI | 是否執行 `npm run fund:local` |
| Borrow 失敗 | LP 是否先 supply liquidity，借款是否超過 LTV |
| Liquidation 失敗 | ETH 價格是否已調低、HF 是否低於 1、清算人是否有 mDAI |
| DAO execute 失敗 | 是否已 queue，timelock 是否已快轉超過 20 秒 |
