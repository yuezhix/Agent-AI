import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createApp } from "./app.js";
import { createDocStore } from "./docStore.js";
import {
  buildIndex,
  serializeIndex,
  restoreIndex,
  answerFromIndex,
} from "./chat.js";
import chatMCP from "./chat-mcp.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5001;

const docStore = createDocStore({
  dataDir: path.join(__dirname, "data"),
  buildIndex,
  serializeIndex,
  restoreIndex,
});
await docStore.load();

const app = createApp({
  docStore,
  answerFromDocument: answerFromIndex,
  answerFromWeb: chatMCP,
  uploadDir: path.join(__dirname, "uploads"),
});

app.listen(PORT, () => {
  console.log("server is running on port " + PORT);
});
