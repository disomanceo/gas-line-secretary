import crypto from "node:crypto";

const LINE_REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

export function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

export function buildReplyMessages(event) {
  if (event.type !== "message" || event.message?.type !== "text") {
    return null;
  }

  const text = event.message.text.trim().toLowerCase();

  if (["สวัสดี", "hello", "hi"].some((keyword) => text.includes(keyword))) {
    return [{ type: "text", text: "สวัสดีครับ ยินดีให้บริการครับ" }];
  }

  if (text.includes("เวลา")) {
    return [{ type: "text", text: `ตอนนี้เวลา ${new Date().toLocaleString("th-TH")}` }];
  }

  if (text.includes("ช่วยเหลือ") || text.includes("help")) {
    return [
      {
        type: "text",
        text: "พิมพ์ สวัสดี, เวลา หรือคำถามที่ต้องการให้ระบบตอบกลับได้เลยครับ"
      }
    ];
  }

  return [{ type: "text", text: `ได้รับข้อความแล้วครับ: ${event.message.text}` }];
}

export async function replyToLine(replyToken, messages, channelAccessToken) {
  if (!replyToken || !messages?.length) {
    return;
  }

  const response = await fetch(LINE_REPLY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({ replyToken, messages })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`LINE reply failed: ${response.status} ${detail}`);
  }
}
