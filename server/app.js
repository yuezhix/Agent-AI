import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const toErrorMessage = (reason) =>
  reason instanceof Error ? reason.message : String(reason);

// Multer decodes multipart file names as latin1; convert back so Chinese names display correctly.
const decodeFileName = (name) => Buffer.from(name, "latin1").toString("utf8");

const isPdf = (file) =>
  file.mimetype === "application/pdf" ||
  path.extname(file.originalname).toLowerCase() === ".pdf";

export const createApp = ({
  docStore,
  answerFromDocument,
  answerFromWeb,
  uploadDir,
  timeoutMs = 60_000,
}) => {
  fs.mkdirSync(uploadDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadDir),
      filename: (req, file, cb) => {
        // Save by document ID so files with the same name do not overwrite each other.
        req.documentId = randomUUID();
        cb(null, `${req.documentId}.pdf`);
      },
    }),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      if (!isPdf(file)) {
        cb(new Error("Only PDF files are supported"));
        return;
      }
      cb(null, true);
    },
  });

  const app = express();
  app.use(cors());

  app.get("/documents", (req, res) => {
    res.json(docStore.list());
  });

  app.post("/upload", (req, res) => {
    upload.single("file")(req, res, async (uploadError) => {
      if (uploadError) {
        const message =
          uploadError.code === "LIMIT_FILE_SIZE"
            ? `File is larger than ${MAX_FILE_SIZE / 1024 / 1024} MB`
            : uploadError.message;
        res.status(400).json({ error: message });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded (field name: file)" });
        return;
      }

      try {
        // Build and cache the index once, at upload time.
        const doc = await docStore.add({
          id: req.documentId,
          name: decodeFileName(req.file.originalname),
          filePath: req.file.path,
        });
        res.json(doc);
      } catch (error) {
        console.error("Failed to index document:", error);
        fs.promises.unlink(req.file.path).catch(() => {});
        res
          .status(500)
          .json({ error: `Failed to index PDF: ${toErrorMessage(error)}` });
      }
    });
  });

  app.get("/chat", async (req, res) => {
    const question =
      typeof req.query.question === "string" ? req.query.question.trim() : "";
    const documentId =
      typeof req.query.documentId === "string" && req.query.documentId
        ? req.query.documentId
        : null;

    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }
    if (documentId && !docStore.has(documentId)) {
      res.status(404).json({ error: `Document not found: ${documentId}` });
      return;
    }

    const ragTask = documentId
      ? withTimeout(
          docStore
            .getIndex(documentId)
            .then((index) => answerFromDocument(index, question)),
          timeoutMs,
          "Document answer"
        )
      : Promise.reject(
          new Error("No document selected. Upload or select a PDF first.")
        );
    const mcpTask = withTimeout(
      Promise.resolve().then(() => answerFromWeb(question)),
      timeoutMs,
      "Web search answer"
    );

    // Run both in parallel; one failing does not drop the other answer.
    const [rag, mcp] = await Promise.allSettled([ragTask, mcpTask]);

    if (rag.status === "rejected" && documentId) {
      console.error("RAG answer failed:", rag.reason);
    }
    if (mcp.status === "rejected") {
      console.error("MCP answer failed:", mcp.reason);
    }

    const body = {
      question,
      documentId,
      documentName: documentId ? docStore.get(documentId)?.name ?? null : null,
      ragAnswer: rag.status === "fulfilled" ? rag.value.text : null,
      ragError: rag.status === "rejected" ? toErrorMessage(rag.reason) : null,
      mcpAnswer: mcp.status === "fulfilled" ? mcp.value.text : null,
      mcpError: mcp.status === "rejected" ? toErrorMessage(mcp.reason) : null,
    };

    const allFailed = rag.status === "rejected" && mcp.status === "rejected";
    res.status(allFailed ? 502 : 200).json(body);
  });

  // Fallback for unexpected errors.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error("Unhandled error:", error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
};
