import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import fs from "fs";

const CONCURRENCY = 1000;
const TIMEOUT = 3000; // 3 detik per proxy
const OUTPUT_FILE = "proxies.txt";

// Daftar sumber proxy (bisa tambahkan lebih banyak URL di sini)
const SOURCES = [
  "https://raw.githubusercontent.com/dpangestuw/Free-Proxy/refs/heads/main/http_proxies.txt",
  "https://api.proxyscrape.com/v4/free-proxy-list/get?request=display_proxies&proxy_format=protocolipport&format=text",
  "https://cdn.jsdelivr.net/gh/proxifly/free-proxy-list@main/proxies/protocols/http/data.txt",
  "https://raw.githubusercontent.com/proxifly/free-proxy-list/refs/heads/main/proxies/protocols/http/data.txt",
];

async function testProxy(item) {
  try {
    // pastikan item memiliki protocol (https-proxy-agent butuh protocol)
    const normalized = item.replace(/^https?:\/\//, "");
    const [host] = normalized.split(":");

    const agent = new HttpsProxyAgent(item, {
      signal: AbortSignal.timeout(TIMEOUT),
    });

    const res = await axios.get("https://ipv4.icanhazip.com", {
      httpsAgent: agent,
      timeout: TIMEOUT,
      proxy: false,
      validateStatus: () => true,
    });

    if (res.data && res.data.trim() === host) {
      console.log("PROXY ALIVE => " + item);
      return item;
    }
  } catch {
    // proxy mati / gagal
  }
  return null;
}

async function fetchAllProxies() {
  const all = [];

  for (const url of SOURCES) {
    try {
      const res = await axios.get(url, { timeout: 5000, validateStatus: () => true });
      if (res.status === 200 && res.data) {
        const lines = res.data.split(/\r?\n/);
        for (let p of lines) {
          p = p.trim();
          if (!p) continue;
          // jika sudah punya protocol, keep; kalau tidak, tambahkan http://
          if (!/^https?:\/\//i.test(p)) {
            p = "http://" + p;
          }
          all.push(p);
        }
      } else {
        console.warn(`Gagal fetch ${url} (status ${res.status})`);
      }
    } catch (err) {
      console.warn(`Error fetch ${url}: ${err.message}`);
    }
  }

  // deduplikasi
  return Array.from(new Set(all));
}

async function main() {
  const proxies = await fetchAllProxies();
  console.log(`Got ${proxies.length} proxies, testing...`);

  const alive = [];

  for (let i = 0; i < proxies.length; i += CONCURRENCY) {
    const batch = proxies.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(testProxy));

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        alive.push(r.value);
      }
    }
  }

  console.log("\n=== ALIVE PROXIES ===");
  console.log(alive.join("\n"));

  fs.writeFileSync(OUTPUT_FILE, alive.join("\n"), "utf-8");
  console.log(`\nSaved ${alive.length} alive proxies to ${OUTPUT_FILE}`);
}

main();