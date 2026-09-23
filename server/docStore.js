import fs from "fs/promises";
import path from "path";

export class DocumentNotFoundError extends Error {
  constructor(id) {
    super(`Document not found: ${id}`);
    this.name = "DocumentNotFoundError";
  }
}

// Keeps document metadata and their vector indexes.
// - metadata: data/documents.json
// - each index: data/indexes/<id>.json (embeddings are saved, so a restart does not re-embed)
export const createDocStore = ({
  dataDir,
  buildIndex,
  serializeIndex,
  restoreIndex,
}) => {
  const entries = new Map(); // id -> { meta, indexPromise }
  const metaFile = path.join(dataDir, "documents.json");
  const indexDir = path.join(dataDir, "indexes");
  const indexFile = (id) => path.join(indexDir, `${id}.json`);

  const persistMeta = async () => {
    const metas = [...entries.values()].map((e) => e.meta);
    await fs.writeFile(metaFile, JSON.stringify(metas, null, 2));
  };

  const load = async () => {
    await fs.mkdir(indexDir, { recursive: true });
    let metas = [];
    try {
      metas = JSON.parse(await fs.readFile(metaFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const meta of metas) {
      // Indexes are restored lazily on first question.
      entries.set(meta.id, { meta, indexPromise: null });
    }
  };

  const add = async ({ id, name, filePath }) => {
    const index = await buildIndex(filePath);
    await fs.mkdir(indexDir, { recursive: true });
    await fs.writeFile(indexFile(id), JSON.stringify(serializeIndex(index)));

    const meta = {
      id,
      name,
      filePath,
      chunkCount: index.chunkCount,
      createdAt: new Date().toISOString(),
    };
    entries.set(id, { meta, indexPromise: Promise.resolve(index) });
    await persistMeta();
    return meta;
  };

  const has = (id) => entries.has(id);

  const get = (id) => entries.get(id)?.meta;

  const list = () =>
    [...entries.values()]
      .map((e) => e.meta)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const getIndex = async (id) => {
    const entry = entries.get(id);
    if (!entry) throw new DocumentNotFoundError(id);
    if (!entry.indexPromise) {
      entry.indexPromise = fs
        .readFile(indexFile(id), "utf8")
        .then((raw) => restoreIndex(JSON.parse(raw)))
        .catch((error) => {
          entry.indexPromise = null; // allow retry
          throw error;
        });
    }
    return entry.indexPromise;
  };

  return { load, add, has, get, list, getIndex };
};
