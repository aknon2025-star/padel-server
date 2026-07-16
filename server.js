// server.js
// Padel Club backend — run with: npm start
// Listens on port 4000 by default (override with PORT env var).

const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");

const authRoutes = require("./auth");
const { router: usersRoutes } = require("./users");
const bookingsRoutes = require("./bookings");
const tournamentsRoutes = require("./tournaments");
const socialRoutes = require("./social");
const chatRoutes = require("./chat");
const courtsRoutes = require("./courts");
const app = express();
const server = http.createServer(app);

app.use(cors()); // allow the mobile app / browser to call this from any origin
app.use(express.json());

// Simple request log — helpful when you're testing from your phone
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString("fa-IR")}  ${req.method} ${req.path}`);
  next();
});

app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/tournaments", tournamentsRoutes);
app.use("/api/social", socialRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/courts", courtsRoutes);
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// ── WEBSOCKET: live chat broadcast ───────────────────────────
const wss = new WebSocketServer({ server, path: "/ws/chat" });
const channelClients = new Map(); // channel -> Set of ws connections

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const channel = url.searchParams.get("channel") || "general";

  if (!channelClients.has(channel)) channelClients.set(channel, new Set());
  channelClients.get(channel).add(ws);

  ws.on("close", () => {
    channelClients.get(channel)?.delete(ws);
  });
});

app.locals.broadcastChat = (channel, message) => {
  const clients = channelClients.get(channel);
  if (!clients) return;
  const payload = JSON.stringify({ type: "message", channel, message });
  for (const client of clients) {
    if (client.readyState === 1) client.send(payload);
  }
};

const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("🎾  سرور باشگاه پدل روشن شد");
  console.log(`     آدرس محلی: http://localhost:${PORT}`);
  console.log(`     برای دسترسی از روی شبکه دیگر، آدرس IP این کامپیوتر را با پورت ${PORT} استفاده کنید`);
  console.log("");
});
