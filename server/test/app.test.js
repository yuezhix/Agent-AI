import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { createApp } from "../app.js";
import { createDocStore } from "../docStore.js";

// Fake index functions: no PDF parsing or OpenAI calls in tests.
const fakeBuildIndex = async (filePath) => ({
  source: filePath,
  chunkCount: 3,
});
const fakeSerialize = (index) => ({ source: index.source, chunkCount: index.chunkCount });
const fakeRestore = async (data) => ({ ...data, restored: true });

let tmpDir;
let server;
let baseUrl;
let docStore;

const startServer = async (overrides = {}) => {
  docStore = createDocStore({
    dataDir: path.join(tmpDir, "data"),
    buildIndex: overrides.buildIndex ?? fakeBuildIndex,
    serializeIndex: fakeSerialize,
    restoreIndex: fakeRestore,
  });
  await docStore.load();
  const app = createApp({
    docStore,
    answerFromDocument:
      overrides.answerFromDocument ??
      (async (index, q) => ({ text: `rag:${q}:${index.chunkCount}` })),
    answerFromWeb: overrides.answerFromWeb ?? (async (q) => ({ text: `web:${q}` })),
    uploadDir: path.join(tmpDir, "uploads"),
    timeoutMs: overrides.timeoutMs ?? 1000,
  });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
};

const uploadPdf = (name = "notes.pdf", type = "application/pdf") => {
  const form = new FormData();
  form.append("file", new Blob(["%PDF-1.4 fake"], { type }), name);
  return fetch(`${baseUrl}/upload`, { method: "POST", body: form });
};

const ask = (params) =>
  fetch(`${baseUrl}/chat?${new URLSearchParams(params)}`);

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentai-test-"));
});

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = null;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test("upload builds an index once and returns a document ID", async () => {
  let buildCount = 0;
  await startServer({
    buildIndex: async (p) => {
      buildCount += 1;
      return fakeBuildIndex(p);
    },
  });

  const res = await uploadPdf("lean.pdf");
  assert.equal(res.status, 200);
  const doc = await res.json();
  assert.ok(doc.id);
  assert.equal(doc.name, "lean.pdf");
  assert.equal(doc.chunkCount, 3);
  assert.equal(buildCount, 1);

  const list = await (await fetch(`${baseUrl}/documents`)).json();
  assert.deepEqual(list.map((d) => d.id), [doc.id]);

  // Asking twice does not rebuild the index.
  await ask({ question: "q1", documentId: doc.id });
  await ask({ question: "q2", documentId: doc.id });
  assert.equal(buildCount, 1);
});

test("files with the same name get different document IDs", async () => {
  await startServer();
  const a = await (await uploadPdf("same.pdf")).json();
  const b = await (await uploadPdf("same.pdf")).json();
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.filePath, b.filePath);
  assert.equal((await (await fetch(`${baseUrl}/documents`)).json()).length, 2);
});

test("upload rejects non-PDF files", async () => {
  await startServer();
  const res = await uploadPdf("notes.txt", "text/plain");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /PDF/);
});

test("upload returns 500 and cleans up when indexing fails", async () => {
  await startServer({
    buildIndex: async () => {
      throw new Error("bad pdf");
    },
  });
  const res = await uploadPdf();
  assert.equal(res.status, 500);
  assert.match((await res.json()).error, /bad pdf/);
  assert.deepEqual(await fs.readdir(path.join(tmpDir, "uploads")), []);
  assert.deepEqual(docStore.list(), []);
});

test("chat returns both answers for the selected document", async () => {
  await startServer();
  const doc = await (await uploadPdf("lean.pdf")).json();
  const res = await ask({ question: "What is MVP?", documentId: doc.id });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ragAnswer, "rag:What is MVP?:3");
  assert.equal(body.mcpAnswer, "web:What is MVP?");
  assert.equal(body.ragError, null);
  assert.equal(body.mcpError, null);
  assert.equal(body.documentName, "lean.pdf");
});

test("chat runs RAG and web search in parallel", async () => {
  // Each side waits until the other has started; this only finishes if both run at the same time.
  let markRagStarted;
  let markWebStarted;
  const ragStarted = new Promise((r) => (markRagStarted = r));
  const webStarted = new Promise((r) => (markWebStarted = r));
  await startServer({
    answerFromDocument: async () => {
      markRagStarted();
      await webStarted;
      return { text: "rag" };
    },
    answerFromWeb: async () => {
      markWebStarted();
      await ragStarted;
      return { text: "web" };
    },
  });
  const doc = await (await uploadPdf()).json();
  const body = await (await ask({ question: "q", documentId: doc.id })).json();
  assert.equal(body.ragAnswer, "rag");
  assert.equal(body.mcpAnswer, "web");
});

test("chat keeps the web answer when RAG fails", async () => {
  await startServer({
    answerFromDocument: async () => {
      throw new Error("OpenAI down");
    },
  });
  const doc = await (await uploadPdf()).json();
  const res = await ask({ question: "q", documentId: doc.id });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ragAnswer, null);
  assert.equal(body.ragError, "OpenAI down");
  assert.equal(body.mcpAnswer, "web:q");
});

test("chat keeps the RAG answer when web search fails", async () => {
  await startServer({
    answerFromWeb: async () => {
      throw new Error("SerpAPI error");
    },
  });
  const doc = await (await uploadPdf()).json();
  const body = await (await ask({ question: "q", documentId: doc.id })).json();
  assert.equal(body.ragAnswer, "rag:q:3");
  assert.equal(body.mcpError, "SerpAPI error");
});

test("chat returns 502 with both errors when both fail", async () => {
  await startServer({
    answerFromDocument: async () => {
      throw new Error("rag failed");
    },
    answerFromWeb: async () => {
      throw new Error("web failed");
    },
  });
  const doc = await (await uploadPdf()).json();
  const res = await ask({ question: "q", documentId: doc.id });
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.ragError, "rag failed");
  assert.equal(body.mcpError, "web failed");
});

test("chat times out a slow answer without blocking the other", async () => {
  await startServer({
    timeoutMs: 50,
    answerFromWeb: () => new Promise(() => {}),
  });
  const doc = await (await uploadPdf()).json();
  const body = await (await ask({ question: "q", documentId: doc.id })).json();
  assert.equal(body.ragAnswer, "rag:q:3");
  assert.match(body.mcpError, /timed out/);
});

test("chat without a document still returns the web answer", async () => {
  await startServer();
  const res = await ask({ question: "q" });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.ragError, /No document selected/);
  assert.equal(body.mcpAnswer, "web:q");
});

test("chat validates question and document ID", async () => {
  await startServer();
  assert.equal((await ask({ question: "   " })).status, 400);
  assert.equal((await ask({ question: "q", documentId: "missing" })).status, 404);
});

test("indexes are restored from disk after a restart", async () => {
  await startServer();
  const doc = await (await uploadPdf("lean.pdf")).json();
  await new Promise((resolve) => server.close(resolve));

  let buildCalled = false;
  await startServer({
    buildIndex: async () => {
      buildCalled = true;
      return fakeBuildIndex("");
    },
    answerFromDocument: async (index, q) => ({
      text: `restored=${index.restored}:${q}`,
    }),
  });
  const list = await (await fetch(`${baseUrl}/documents`)).json();
  assert.deepEqual(list.map((d) => d.id), [doc.id]);
  const body = await (await ask({ question: "q", documentId: doc.id })).json();
  assert.equal(body.ragAnswer, "restored=true:q");
  assert.equal(buildCalled, false);
});
