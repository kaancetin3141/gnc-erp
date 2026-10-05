// ─────────────────────────────────────────────────────────────────────────────
// 🍉 Fruit Storm — GNC CRM mini oyun servisi
// Task 3-b | Port: 3003 (SABİT — chat-service 3005'e taşındı, 3003 boştu)
// Harici bağımlılık YOK; oyun tek dosya: game.html (okunup serve edilir)
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PORT = 3003; // KESİN 3003 — env'den okuma YOK

let html = "<!doctype html><meta charset='utf-8'><title>Fruit Storm</title><p>game.html bulunamadı.</p>";
try {
  html = readFileSync(join(import.meta.dir, "game.html"), "utf8");
} catch (e) {
  console.error("[fruit-storm] game.html okunamadı:", e);
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/health") {
      return new Response("ok", {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (pathname === "/favicon.ico") {
      return new Response("🍉", { headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    return new Response("404 — Bulunamadı", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
});

console.log(`🍉 Fruit Storm hazır → http://localhost:${server.port} (health: /health)`);
