import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { PromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

const CHUNK_SIZE = 500;
const CHUNK_OVERLAP = 0;

const template = `Use the following pieces of context to answer the question at the end.
If you don't know the answer, just say that you don't know, don't try to make up an answer.
Use three sentences maximum and keep the answer as concise as possible.

{context}
Question: {question}
Helpful Answer:`;

const prompt = PromptTemplate.fromTemplate(template);

// Create clients lazily so that importing this module does not require an API key.
const createEmbeddings = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  return new OpenAIEmbeddings(apiKey ? { apiKey } : {});
};

const createModel = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  return new ChatOpenAI({ model: "gpt-5", ...(apiKey && { apiKey }) });
};

// Called once when a PDF is uploaded: load -> split -> embed -> in-memory index.
export const buildIndex = async (filePath) => {
  const loader = new PDFLoader(filePath);
  const data = await loader.load();

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });
  const splitDocs = await textSplitter.splitDocuments(data);
  if (splitDocs.length === 0) {
    throw new Error("No text could be extracted from this PDF");
  }

  const vectorStore = await MemoryVectorStore.fromDocuments(
    splitDocs,
    createEmbeddings()
  );

  return { vectorStore, chunkCount: splitDocs.length };
};

// Convert the index into plain JSON so it can be written to disk.
export const serializeIndex = ({ vectorStore, chunkCount }) => ({
  chunkCount,
  vectors: vectorStore.memoryVectors.map(({ content, embedding, metadata }) => ({
    content,
    embedding,
    metadata,
  })),
});

// Rebuild the vector store from saved embeddings without calling the embeddings API again.
export const restoreIndex = async ({ chunkCount, vectors }) => {
  const vectorStore = new MemoryVectorStore(createEmbeddings());
  await vectorStore.addVectors(
    vectors.map((v) => v.embedding),
    vectors.map(
      (v) => new Document({ pageContent: v.content, metadata: v.metadata })
    )
  );
  return { vectorStore, chunkCount };
};

// Called for every question: only retrieval + LLM, no re-indexing.
export const answerFromIndex = async ({ vectorStore }, query) => {
  const retriever = vectorStore.asRetriever();
  const relevantDocs = await retriever.invoke(query);
  const context = relevantDocs.map((doc) => doc.pageContent).join("\n\n");

  const formattedPrompt = await prompt.format({ context, question: query });
  const response = await createModel().invoke(formattedPrompt);

  return { text: response.content };
};
