import axios from "axios";
import fs from "fs";

/* =======================
   ENV + SAFETY CHECK
======================= */

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK?.trim();
if (!DISCORD_WEBHOOK) {
  console.error("❌ DISCORD_WEBHOOK is missing");
  process.exit(1);
}

const ZORA_API = "https://api.zora.co/universal/graphql";

/* =======================
   HEADERS (browser-like)
======================= */

const HEADERS = {
  "x-zora-new-infra": "true",
  "content-type": "application/json",
  "accept": "multipart/mixed, application/json",
  "origin": "https://zora.co",
  "referer": "https://zora.co",
  "user-agent": "Mozilla/5.0"
};

/* =======================
   GRAPHQL QUERY
   (reduced load)
======================= */

const QUERY_BODY = {
  hash: "f44d9b633ced78a5000cccf02cb973b4",
  variables: {
    listType: "NEW_CREATORS",
    first: 5,        // 🔑 reduce load
    after: null
  },
  operationName: "NewCreatorsQuery"
};

/* =======================
   SEEN CACHE
======================= */

let seen = new Set();

if (fs.existsSync("seen.json")) {
  seen = new Set(JSON.parse(fs.readFileSync("seen.json")));
}

/* =======================
   FETCH ZORA
======================= */

async function fetchNewCreators() {
  const res = await axios.post(
    ZORA_API,
    QUERY_BODY,
    { headers: HEADERS }
  );

  return res.data.data.exploreList.edges;
}

/* =======================
   DISCORD EMBED
======================= */

async function sendToDiscord(node) {
  const embed = {
    username: "Zora Alerts",
    embeds: [
      {
        title: `🚀 New Zora Creator Token: ${node.title}`,
        color: 0x5865f2,

        author: {
          name: `Creator: ${node.creatorProfile.displayName} (@${node.creatorProfile.handle})`,
          icon_url: node.creatorProfile.avatar?.downloadableUri
        },

        fields: [
          {
            name: "Address",
            value: `\`\`\`${node.address}\`\`\``,
            inline: false
          },
          { name: "Chain ID", value: `${node.chainId}`, inline: true },
          { name: "Total Supply", value: `${node.totalSupply}`, inline: true },
          { name: "Unique Holders", value: `${node.uniqueHolders}`, inline: true },
          {
            name: "Market Cap",
            value: node.marketCap ? `$${Number(node.marketCap).toFixed(2)}` : "—",
            inline: true
          },
          { name: "Created At", value: node.createdAt, inline: true }
        ],

        image: {
          url: node.mediaContent?.previewImage?.downloadableUri
        },

        footer: {
          text: "Zora • Base"
        },

        timestamp: new Date().toISOString()
      }
    ]
  };

  await axios.post(DISCORD_WEBHOOK, embed);
}

/* =======================
   POLL LOOP (SAFE)
======================= */

async function poll() {
  try {
    const edges = await fetchNewCreators();

    for (const { node } of edges) {
      if (seen.has(node.address)) continue;

      seen.add(node.address);
      fs.writeFileSync("seen.json", JSON.stringify([...seen]));

      await sendToDiscord(node);
    }
  } catch (e) {
    if (e.response?.status === 429) {
      console.log("⚠️ Rate limited by Zora — backing off safely");
      return; // DO NOT CRASH
    }
    console.error("❌ Error:", e.message);
  }
}

/* =======================
   START
======================= */

// 🔑 15 seconds = safe + still early
setInterval(poll, 15000);

console.log("🚀 Zora Discord bot running (safe mode)...");
