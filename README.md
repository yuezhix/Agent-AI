# Agent AI

Agent AI is a document question-answering web application built with React, Node.js, LangChain, and the Model Context Protocol (MCP). Users upload PDF files, select a document, and ask questions by text or voice. Each question returns two answers side by side: one from the selected PDF (RAG) and one from a web search.

Each PDF is indexed once when it is uploaded. Later questions only run retrieval and answer generation, so the embeddings API is not called again for the same document.

## Features

- PDF upload with type and size validation
- One-time indexing at upload, with embeddings saved to disk and restored after a restart
- Document IDs, a document list, and document selection before asking
- RAG answers from the selected PDF with OpenAI embeddings and an in-memory vector store
- Web answers through an MCP server that wraps SerpAPI Google search
- Parallel RAG and web search requests; if one fails or times out, the other answer is still shown
- Voice input with the Web Speech API and spoken RAG answers with text-to-speech
- Backend and frontend automated tests

## Tech Stack

| Area | Technology |
| --- | --- |
| Web UI | React 19, Ant Design 6, Axios |
| Voice | react-speech-recognition, speak-tts |
| Backend | Node.js, Express, Multer |
| RAG | LangChain, OpenAI embeddings, MemoryVectorStore, GPT-5 |
| Web search | MCP TypeScript SDK (stdio), SerpAPI |
| Test | Jest, React Testing Library, Node.js test runner |

## Project Structure

| Path | Responsibility |
| --- | --- |
| `src/App.js` | Holds the conversation, loading state, document list, and selected document. |
| `src/api.js` | Sends upload, document list, and chat requests; turns request failures into answer errors. |
| `src/components/PdfUploader.js` | Validates PDF files and uploads them. |
| `src/components/DocumentSelector.js` | Lists uploaded documents and switches the selected one. |
| `src/components/ChatComponent.js` | Handles text questions, Chat Mode, speech recognition, and text-to-speech. |
| `src/components/RenderQA.js` | Shows each question with the RAG answer and web answer, or the error for each. |
| `server/server.js` | Loads environment variables, creates the document store, and starts the server. |
| `server/app.js` | Defines the Express routes, upload rules, timeouts, and error responses. |
| `server/docStore.js` | Keeps document metadata and vector indexes, and restores them from disk. |
| `server/chat.js` | Builds, saves, and restores the PDF index, and answers from retrieved chunks. |
| `server/chat-mcp.js` | Starts the MCP client, calls `search_web`, and summarizes the results. |
| `server/mcp-server.js` | MCP server that exposes SerpAPI search as the `search_web` tool. |

When a PDF is uploaded, the server loads the text, splits it into 500-character chunks, creates embeddings, and saves the index to `server/data/indexes/<id>.json`. The file itself is saved as `server/uploads/<id>.pdf`, so files with the same name do not overwrite each other.

For each question, `/chat` runs the RAG answer and the web search answer with `Promise.allSettled`. Each task has a 60-second timeout. The response contains `ragAnswer`, `ragError`, `mcpAnswer`, and `mcpError`, and the frontend shows each answer or its error separately.

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/documents` | List uploaded documents, newest first |
| POST | `/upload` | Upload a PDF (`file` field), build its index, and return the document |
| GET | `/chat?question=...&documentId=...` | Return the RAG answer and web search answer |

`/chat` returns `400` when the question is empty, `404` when the document does not exist, and `502` when both answers fail. If only one answer fails, it returns `200` with the error in `ragError` or `mcpError`.

## Run Locally

Requirements:

- Node.js 22 or later
- OpenAI API key
- SerpAPI key

Install dependencies:

```bash
npm install
cd server && npm install
```

Create `server/.env`:

```
OPENAI_API_KEY=your_openai_key
SERPAPI_KEY=your_serpapi_key
```

Start the frontend and backend together:

```bash
npm run dev
```

Open http://localhost:3000. In development, the React dev server forwards API requests to the backend on port 5001 through the `proxy` setting in `package.json`.

## Configuration

| Variable | Where | Default | Description |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | `server/.env` | None | Used for embeddings and answers |
| `SERPAPI_KEY` | `server/.env` | None | Used by the MCP search tool |
| `PORT` | `server/.env` | `5001` | Backend port |
| `REACT_APP_API_URL` | frontend environment | Dev proxy | Backend URL for the frontend; overrides the proxy |

Uploaded files and saved indexes are stored in `server/uploads/` and `server/data/`. Both are ignored by Git.

## Test and Build

Run the frontend tests:

```bash
CI=true npm test -- --watchAll=false
```

Run the backend tests:

```bash
cd server && npm test
```

The backend tests use fake index and answer functions, so they do not call OpenAI or SerpAPI.

Build the frontend:

```bash
npm run build
```

## Current Scope

This is a local proof of concept. Documents cannot be deleted from the UI, conversations are only kept in the browser, and answers do not include PDF page numbers or web links. The API has no authentication or per-user isolation. Voice input and text-to-speech depend on browser support and microphone permission.
