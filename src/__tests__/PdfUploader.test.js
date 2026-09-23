import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PdfUploader from "../components/PdfUploader";
import { uploadDocument } from "../api";

jest.mock("../api", () => ({
  uploadDocument: jest.fn(),
  getErrorMessage: (error) => error?.message || "Request failed",
}));

// Ant Design's Dragger hides the file input, so reach it directly.
// eslint-disable-next-line testing-library/no-node-access
const getFileInput = (container) => container.querySelector('input[type="file"]');

describe("PdfUploader", () => {
  test("uploads a PDF and reports the indexed document", async () => {
    const doc = { id: "doc-1", name: "lean.pdf", chunkCount: 12 };
    uploadDocument.mockResolvedValue(doc);
    const onUploaded = jest.fn();
    const { container } = render(<PdfUploader onUploaded={onUploaded} />);

    const file = new File(["%PDF-1.4"], "lean.pdf", { type: "application/pdf" });
    userEvent.upload(getFileInput(container), file);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(doc));
    expect(uploadDocument).toHaveBeenCalledWith(expect.objectContaining({ name: "lean.pdf" }));
    expect(await screen.findByText(/uploaded and indexed \(12 chunks\)/)).toBeInTheDocument();
  });

  test("rejects non-PDF files without calling the backend", async () => {
    const onUploaded = jest.fn();
    const { container } = render(<PdfUploader onUploaded={onUploaded} />);

    userEvent.upload(getFileInput(container), new File(["hi"], "notes.txt", { type: "text/plain" }));

    expect(await screen.findByText("notes.txt is not a PDF file.")).toBeInTheDocument();
    expect(uploadDocument).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  test("shows the server error when upload fails", async () => {
    uploadDocument.mockRejectedValue(new Error("Failed to index PDF: bad pdf"));
    const onUploaded = jest.fn();
    const { container } = render(<PdfUploader onUploaded={onUploaded} />);

    userEvent.upload(getFileInput(container), new File(["%PDF"], "bad.pdf", { type: "application/pdf" }));

    expect(await screen.findByText(/bad.pdf upload failed: Failed to index PDF: bad pdf/)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
