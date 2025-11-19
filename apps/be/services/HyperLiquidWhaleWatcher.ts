// services/checkHyperliquidWhaleDepositsAndNotify.ts
import { JsonRpcProvider, Contract, Log } from "ethers";
import Bottleneck from "bottleneck";
import User from "../models/UserModel";          // path giống file emergency
import { bot } from "../bots/telegramBot";       // path giống file emergency

// Arbitrum RPC (dùng Alchemy/Infura…)
const ARB_RPC =
  process.env.ARB_RPC ?? "https://arb1.arbitrum.io/rpc";

// USDC & Bridge2
const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const BRIDGE2 = "0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7";

// USDC ABI tối thiểu
const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const provider = new JsonRpcProvider(ARB_RPC);
const usdc = new Contract(USDC, ERC20_ABI, provider);

// 5m USDC với 6 decimals
const AMOUNT_THRESHOLD = BigInt(1_000_000) * BigInt(10 ** 6);

// bạn có thể lưu 2 biến này vào DB nếu cần bền vững
let lastCheckedBlock = 0;
const seenAddresses = new Set<string>();

// helper: cắt message
function chunkByChar(text: string, maxChars = 3800) {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    out.push(text.slice(i, i + maxChars));
  }
  return out;
}

export async function checkHyperliquidWhaleDepositsAndNotify() {
  try {
    const latestBlock = await provider.getBlockNumber();

    if (lastCheckedBlock === 0) {
      // lần đầu, lùi 5000 block cho có data
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

    type WhaleEvent = {
      from: string;
      amount: bigint;
      isNew: boolean;
      txHash: string;
      blockNumber: number;
    };

    const whaleEvents: WhaleEvent[] = [];

    for (const log of logs) {
      const parsed = usdc.interface.parseLog(log);
      if (!parsed) continue;

      const from = (parsed.args.from as string).toLowerCase();
      const value = parsed.args.value as bigint;

      if (value >= AMOUNT_THRESHOLD) {
        const isNew = !seenAddresses.has(from);
        seenAddresses.add(from);

        console.log(
          `[DEPOSIT] from=${from}, amount=${Number(value) / 1e6} USDC, new=${isNew}`
        );

        whaleEvents.push({
          from,
          amount: value,
          isNew,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber ?? 0,
        });
      }
    }

    lastCheckedBlock = latestBlock;

    if (!whaleEvents.length) {
      console.log("No whale deposits in this interval.");
      return;
    }

    // --------- Soạn message gửi user ---------
    const lines = whaleEvents.map((e) => {
      const amountNum = Number(e.amount) / 1e6; // USDC 6 decimals
      const amountStr = amountNum.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
      const labelNew = e.isNew ? " (ví mới)" : "";
      const txLink = `https://arbiscan.io/tx/${e.txHash}`;
      return `🐋 Whale deposit${labelNew}\n` +
             `• Ví: ${e.from}\n` +
             `• Số lượng: ${amountStr} USDC\n` +
             `• Tx: ${txLink}`;
    });

    const header =
      "🚨 Phát hiện deposit lớn vào Hyperliquid (Arbitrum USDC bridge):\n";

    const footer =
      "\n⚠️ Đây là thông báo quan sát on-chain, không phải lời khuyên đầu tư.";

    const full = `${header}\n${lines.join("\n\n")}${footer}`;
    const chunks = chunkByChar(full, 3500);

    // --------- Gửi cho người dùng đã bật thông báo ---------

    const globalLimiter = new Bottleneck({
      reservoir: 25,
      reservoirRefreshAmount: 25,
      reservoirRefreshInterval: 1000,
      maxConcurrent: 5,
    });
    const perChatLimiter = new Bottleneck.Group({
      maxConcurrent: 1,
      minTime: 1100,
    });

    const sendSafe = async (chatIdStr: string, text: string) => {
      const limiter = perChatLimiter.key(chatIdStr);
      return globalLimiter.schedule(() =>
        limiter.schedule(() =>
          bot.telegram.sendMessage(chatIdStr, text, {
            link_preview_options: { is_disabled: true },
          })
        )
      );
    };

    const cursor = User.find({
      notificationsEnabled: true,
      telegramChatId: { $exists: true, $ne: null },
    })
      .select({ _id: 1, telegramChatId: 1 })
      .lean()
      .cursor();

    for await (const u of cursor) {
      const chatId = String(u.telegramChatId);
      try {
        for (const ch of chunks) {
          await sendSafe(chatId, ch);
        }
      } catch (err: any) {
        const code = err?.on?.error_code || err?.code;
        const desc = err?.on?.description || err?.message;
        console.error(`send whale notify to user ${u._id} failed:`, code, desc);
        if (code === 403 || (typeof desc === "string" && /bot.*blocked/i.test(desc))) {
          await User.updateOne(
            { _id: u._id },
            { $set: { notificationsEnabled: false }, $unset: { telegramChatId: "" } }
          );
        }
      }
    }

    console.log(`Whale deposits notifications sent: ${whaleEvents.length} event(s)`);
  } catch (e) {
    console.error("Error checking Hyperliquid whale deposits:", e);
  }
}
