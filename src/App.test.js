import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSpeechRecognition } from "react-speech-recognition";
import App from "./App";
import { fetchDocuments, uploadDocument, askQuestion } from "./api";

jest.mock("./api", () => ({
  fetchDocuments: jest.fn(),
  uploadDocument: jest.fn(),
  askQuestion: jest.fn(),
  getErrorMessage: (error) => error?.message || "Request failed",
}));

jest.mock("react-speech-recognition", () => ({
  __esModule: true,
  default: { startListening: jest.fn(), stopListening: jest.fn() },
  useSpeechRecognition: jest.fn(),
}));

jest.mock("speak-tts", () =>
  class MockSpeech {
    init() {
      return Promise.resolve({});
    }
    speak() {
      return Promise.resolve();
    }
    cancel() {}
  }
);

// The jsdom bundled with react-scripts 5 throws on getByRole(name) and userEvent.click/type for
// Ant Design buttons (getComputedStyle on its CSS-in-JS styles), so find buttons by text and use fireEvent.
// eslint-disable-next-line testing-library/no-node-access
const getButton = (text) => screen.getByText(text).closest("button");

// Ant Design's Dragger hides the file input, so reach it directly.
// eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
const getFileInput = (container) => container.querySelector('input[type="file"]');

beforeEach(() => {
  useSpeechRecognition.mockReturnValue({
    transcript: "",
    listening: false,
    resetTranscript: () => {},
    browserSupportsSpeechRecognition: true,
    isMicrophoneAvailable: true,
  });
  fetchDocuments.mockResolvedValue([
    { id: "doc-1", name: "old.pdf", chunkCount: 3, createdAt: "2026-09-01T00:00:00Z" },
  ]);
});

test("loads saved documents and selects the first one", async () => {
  render(<App />);
  expect(await screen.findByText("old.pdf (3 chunks)")).toBeInTheDocument();
});

test("upload -> select new document -> ask -> show both answers", async () => {
  uploadDocument.mockResolvedValue({ id: "doc-2", name: "lean.pdf", chunkCount: 12 });
  askQuestion.mockResolvedValue({
    documentName: "lean.pdf",
    ragAnswer: "Answer from the PDF",
    ragError: null,
    mcpAnswer: "Answer from the web",
    mcpError: null,
  });
  const { container } = render(<App />);
  await screen.findByText("old.pdf (3 chunks)");

  userEvent.upload(
    getFileInput(container),
    new File(["%PDF"], "lean.pdf", { type: "application/pdf" })
  );
  // The newly uploaded document becomes the selected one.
  expect(await screen.findByText("lean.pdf (12 chunks)")).toBeInTheDocument();

  fireEvent.change(screen.getByPlaceholderText("input search text"), { target: { value: "What is MVP?" } });
  fireEvent.click(getButton("Ask"));

  await waitFor(() => expect(askQuestion).toHaveBeenCalledWith("What is MVP?", "doc-2"));
  expect(await screen.findByText("Answer from the PDF")).toBeInTheDocument();
  expect(screen.getByText("Answer from the web")).toBeInTheDocument();
  expect(screen.getByText("RAG Answer (from lean.pdf):")).toBeInTheDocument();
});

test("keeps the web answer on screen when the document answer fails", async () => {
  askQuestion.mockResolvedValue({
    ragAnswer: null,
    ragError: "Document answer timed out after 60s",
    mcpAnswer: "Answer from the web",
    mcpError: null,
  });
  render(<App />);
  await screen.findByText("old.pdf (3 chunks)");

  fireEvent.change(screen.getByPlaceholderText("input search text"), { target: { value: "q" } });
  fireEvent.click(getButton("Ask"));

  expect(await screen.findByText("Failed: Document answer timed out after 60s")).toBeInTheDocument();
  expect(screen.getByText("Answer from the web")).toBeInTheDocument();
});
