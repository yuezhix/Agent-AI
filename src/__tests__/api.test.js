import axios from "axios";
import { askQuestion, uploadDocument, getErrorMessage } from "../api";

jest.mock("axios");

describe("api", () => {
  test("askQuestion sends question and documentId", async () => {
    axios.get.mockResolvedValue({ data: { ragAnswer: "r", mcpAnswer: "m" } });
    const answer = await askQuestion("What is MVP?", "doc-1");
    expect(axios.get).toHaveBeenCalledWith("http://localhost:5001/chat", {
      params: { question: "What is MVP?", documentId: "doc-1" },
    });
    expect(answer).toEqual({ ragAnswer: "r", mcpAnswer: "m" });
  });

  test("askQuestion omits documentId when no document is selected", async () => {
    axios.get.mockResolvedValue({ data: {} });
    await askQuestion("q", null);
    expect(axios.get.mock.calls[0][1]).toEqual({ params: { question: "q" } });
  });

  test("askQuestion returns both server errors on 502", async () => {
    const data = { ragAnswer: null, ragError: "rag failed", mcpAnswer: null, mcpError: "web failed" };
    axios.get.mockRejectedValue({ message: "Request failed with status code 502", response: { status: 502, data } });
    await expect(askQuestion("q", "doc-1")).resolves.toEqual(data);
  });

  test("askQuestion turns a network error into two answer errors", async () => {
    axios.get.mockRejectedValue(new Error("Network Error"));
    await expect(askQuestion("q", "doc-1")).resolves.toEqual({
      ragAnswer: null,
      ragError: "Network Error",
      mcpAnswer: null,
      mcpError: "Network Error",
    });
  });

  test("uploadDocument posts the file as multipart form data", async () => {
    axios.post.mockResolvedValue({ data: { id: "doc-1", name: "a.pdf" } });
    const file = new File(["%PDF"], "a.pdf", { type: "application/pdf" });
    await expect(uploadDocument(file)).resolves.toEqual({ id: "doc-1", name: "a.pdf" });
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe("http://localhost:5001/upload");
    expect(body.get("file")).toBe(file);
  });

  test("getErrorMessage prefers the server error message", () => {
    expect(getErrorMessage({ message: "400", response: { data: { error: "Only PDF files are supported" } } }))
      .toBe("Only PDF files are supported");
    expect(getErrorMessage(new Error("Network Error"))).toBe("Network Error");
  });
});
