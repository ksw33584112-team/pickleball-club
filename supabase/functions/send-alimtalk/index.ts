// ============================================================
// Supabase Edge Function: send-alimtalk
// 카카오 알림톡(또는 SMS) 발송용 서버 함수. (4단계에서 연결)
// 배포: supabase functions deploy send-alimtalk
// 키 설정 예:
//   supabase secrets set SOLAPI_API_KEY=... SOLAPI_API_SECRET=... \
//     KAKAO_PF_ID=... KAKAO_TEMPLATE_ID=... SENDER_PHONE=...
// ============================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { message, recipients } = await req.json();
    if (!Array.isArray(recipients) || recipients.length === 0) return json({ error: "받는 사람이 없습니다." }, 400);
    const results = [];
    for (const r of recipients) {
      if (!r.phone) { results.push({ id: r.id, ok: false, reason: "전화번호 없음" }); continue; }
      try { await sendOne(r.phone, message); results.push({ id: r.id, ok: true }); }
      catch (e) { results.push({ id: r.id, ok: false, reason: String(e) }); }
    }
    return json({ count: results.filter(x => x.ok).length, results });
  } catch (e) { return json({ error: String(e) }, 500); }
});

async function sendOne(phone: string, text: string) {
  const apiKey = Deno.env.get("SOLAPI_API_KEY"), apiSecret = Deno.env.get("SOLAPI_API_SECRET");
  const pfId = Deno.env.get("KAKAO_PF_ID"), templateId = Deno.env.get("KAKAO_TEMPLATE_ID"), sender = Deno.env.get("SENDER_PHONE");
  if (!apiKey || !apiSecret) { console.log("[데모] 발송 생략:", phone, text); return; }
  const date = new Date().toISOString(), salt = crypto.randomUUID();
  const sig = await hmac(apiSecret, date + salt);
  const auth = `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${sig}`;
  const body = { message: { to: phone.replace(/-/g, ""), from: sender, type: pfId && templateId ? "ATA" : "SMS", text, kakaoOptions: pfId && templateId ? { pfId, templateId } : undefined } };
  const res = await fetch("https://api.solapi.com/messages/v4/send", { method: "POST", headers: { "Content-Type": "application/json", Authorization: auth }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("Solapi " + res.status + " " + (await res.text()));
}
async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function json(obj: unknown, status = 200) { return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } }); }
