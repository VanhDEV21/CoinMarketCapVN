import { JsonRpcProvider, Contract, Interface, Log } from "ethers";

// Arbitrum RPC (dùng Alchemy/Infura…)
const ARB_RPC =
  process.env.ARB_RPC ?? "https://arb1.arbitrum.io/rpc";

// USDC & Bridge2
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const BRIDGE2 = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";

// USDC ABI tối thiểu
const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const provider = new JsonRpcProvider(ARB_RPC);
const usdc = new Contract(USDC, ERC20_ABI, provider);

// 5m USDC với 6 decimals
const AMOUNT_THRESHOLD = BigInt(100_000) * BigInt(10 ** 6);

// giả sử bạn load từ DB
let lastCheckedBlock = 0;             // cần load từ storage
const seenAddresses = new Set<string>(); // cũng load từ storage

async function checkBigNewDeposits() {
  const latestBlock = await provider.getBlockNumber();

  // lần đầu có thể set lastCheckedBlock = latestBlock - 5_000 chẳng hạn
  if (lastCheckedBlock === 0) {
    lastCheckedBlock = latestBlock - 5000;
  }

  // filter Transfer(..., to = BRIDGE2)
const transferEvent = usdc.interface.getEvent("Transfer");
if (!transferEvent) {
  throw new Error("Transfer event not found in USDC interface");
}
const transferTopic = transferEvent.topicHash;


  const logs: Log[] = await provider.getLogs({
    address: USDC,
    fromBlock: lastCheckedBlock + 1,
    toBlock: latestBlock,
    topics: [
      transferTopic,
      null,                          // from (indexed)
      "0x" + BRIDGE2.slice(2).padStart(64, "0"), // to = bridge
    ],
  });

for (const log of logs) {
  const parsed = usdc.interface.parseLog(log);

  if (!parsed) {
    // không match event nào, bỏ qua log này
    continue;
  }

  const from = (parsed.args.from as string).toLowerCase();
  const value = parsed.args.value as bigint;

  if (value >= AMOUNT_THRESHOLD) {
    const isNew = !seenAddresses.has(from);

    console.log(
      `[DEPOSIT] from=${from}, amount=${Number(value) / 1e6} USDC, new=${isNew}`
    );

    if (isNew) {
      console.log(`🔥 NEW WHALE DEPOSIT: ${from}`);
      seenAddresses.add(from);
    }
  }
}


  lastCheckedBlock = latestBlock;
  // TODO: persist lastCheckedBlock & seenAddresses ra DB/file
}
async function main() {
  console.log("🚀 Starting Hyperliquid Deposit Watcher on Arbitrum...");
  console.log("----------------------------------------------------");

  // run once immediately
  await checkBigNewDeposits();

  // then run every 10 seconds
  setInterval(async () => {
    try {
      await checkBigNewDeposits();
    } catch (err) {
      console.error("Error:", err);
    }
  }, 10_000);
}

main();