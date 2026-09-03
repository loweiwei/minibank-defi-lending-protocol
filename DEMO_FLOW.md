# MiniBank 完整 Demo 流程

這份文件是推甄展示用腳本，目標是讓你可以穩定跑過主要功能。

## 0. 前置準備

### 啟動本地鏈

第一個終端機：

```bash
npm run node
```

### 部署合約

第二個終端機：

```bash
npm run deploy:local
```

### 發測試 mDAI

```bash
npm run fund:local
```

### 啟動前端

```bash
npx serve frontend
```

瀏覽器打開：

```text
http://localhost:3000
```

MetaMask 網路：

```text
RPC URL: http://127.0.0.1:8545
Chain ID: 31337
```

## 1. 建議帳號分工

| 帳號 | 用途 |
| --- | --- |
| Account #0 | 部署者、DAO 提案與投票 |
| Account #1 | LP，提供 mDAI 流動性 |
| Account #2 | 借款人，抵押 ETH 並借 mDAI |
| Account #3 | 清算人，清算高風險帳戶 |

Account #1 到 #4 會透過 `npm run fund:local` 各取得 20,000 mDAI。

## 2. LP 流動性流程

切到 Account #1。

前端進入 `LP 流動性`：

```text
存入 mDAI: 5000
```

按 `存入 mDAI`。

預期結果：

```text
aMDAI 增加
liquidityPool 增加
mDAI 餘額減少
```

## 3. 抵押與借貸流程

切到 Account #2。

前端進入 `抵押與借貸`：

```text
存入 ETH: 2
借出 mDAI: 1000
```

預期結果：

```text
抵押 ETH 增加
mDAI 餘額增加
總覽頁顯示債務與健康因子
```

## 4. 還款與提款流程

仍使用 Account #2。

部分還款：

```text
償還 mDAI: 100
```

提款測試：

```text
提取 ETH: 0.1
```

如果提款失敗，通常代表健康因子不足，這是合約保護機制。

## 5. 清算流程

使用 Account #2 先保留債務，例如抵押 2 ETH、借 1000 mDAI。

切回 Account #0，進入 `清算與價格`：

```text
模擬 ETH 價格: 400
```

按 `模擬價格變動`，再按 `更新清算名單`。

目前 Oracle 改價已加上 owner 權限，因此價格模擬需由部署者 Account #0 操作。

切到 Account #3。

輸入：

```text
要清算的地址: Account #2 地址
mDAI 數量: 100
```

也可以先按 `建議最大清償額度`。

按 `清算`。

預期結果：

```text
Account #3 mDAI 減少
Account #3 ETH 增加
Account #2 抵押 ETH 減少
Account #2 債務降低
協議 reserve 增加
```

## 6. BKT 獎勵流程

如果想快速累積 reward，可在終端機執行：

```bash
node -e "const { ethers } = require('ethers'); (async()=>{const p=new ethers.JsonRpcProvider('http://127.0.0.1:8545'); await p.send('evm_increaseTime',[3600]); await p.send('evm_mine',[]); console.log('time advanced');})();"
```

Account #1：

```text
LP 流動性 -> 領取 LP 獎勵
```

Account #2：

```text
抵押與借貸 -> 領取借款人獎勵
```

## 7. DAO 治理流程

切到 Account #0。

進入 `DAO 治理`，先按：

```text
委託投票權給自己
```

建立提案，例如調整利率：

```text
新利率: 7%
提案描述: demo set interest 7
```

記下 Proposal ID。

### 讓提案進入投票期

```bash
node -e "const { ethers } = require('ethers'); (async()=>{const p=new ethers.JsonRpcProvider('http://127.0.0.1:8545'); await p.send('evm_mine',[]); console.log('mined 1 block');})();"
```

進入 `提案投票`，輸入 Proposal ID，選 `支持`，按 `投票`。

### 結束投票期

```bash
node -e "const { ethers } = require('ethers'); (async()=>{const p=new ethers.JsonRpcProvider('http://127.0.0.1:8545'); for(let i=0;i<5;i++) await p.send('evm_mine',[]); console.log('mined 5 blocks');})();"
```

### Queue

```text
提案 ID: 你的 Proposal ID
提案描述: demo set interest 7
函式: setInterestRate
參數: 700
```

按 `排程提案`。

### Execute

Timelock demo 延遲為 20 秒，可直接前進時間：

```bash
node -e "const { ethers } = require('ethers'); (async()=>{const p=new ethers.JsonRpcProvider('http://127.0.0.1:8545'); await p.send('evm_increaseTime',[25]); await p.send('evm_mine',[]); console.log('timelock passed');})();"
```

填入同樣資料：

```text
提案 ID: 你的 Proposal ID
提案描述: demo set interest 7
函式: setInterestRate
參數: 700
```

按 `執行提案`。

預期結果：

```text
BankV3 interestRate 變成 700
前端獎勵/參數區更新
```

## 8. 常見問題

### could not decode result data value="0x"

通常是 MetaMask 連錯鏈。請確認：

```text
chainId = 31337
RPC = http://127.0.0.1:8545
```

### MetaMask 沒看到 mDAI

手動匯入 token：

```text
MiniDAI address: frontend/contract-address.json 裡的 MiniDAI
Symbol: mDAI
Decimals: 18
```

### 重開 Hardhat node 後前端錯誤

重新執行：

```bash
npm run deploy:local
npm run fund:local
```

並在前端按 `Ctrl + F5`。
