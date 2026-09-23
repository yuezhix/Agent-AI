import { render, screen } from "@testing-library/react";
import RenderQA from "../components/RenderQA";

describe("RenderQA", () => {
  test("shows the question with both answers", () => {
    render(
      <RenderQA
        isLoading={false}
        conversation={[
          {
            question: "What is MVP?",
            documentName: "lean.pdf",
            answer: { ragAnswer: "From the PDF", mcpAnswer: "From the web" },
          },
        ]}
      />
    );
    expect(screen.getByText("What is MVP?")).toBeInTheDocument();
    expect(screen.getByText("RAG Answer (from lean.pdf):")).toBeInTheDocument();
    expect(screen.getByText("From the PDF")).toBeInTheDocument();
    expect(screen.getByText("From the web")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("shows an error for the failed answer and keeps the other one", () => {
    render(
      <RenderQA
        isLoading={false}
        conversation={[
          {
            question: "q",
            answer: { ragAnswer: null, ragError: "OpenAI down", mcpAnswer: "From the web", mcpError: null },
          },
        ]}
      />
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Failed: OpenAI down");
    expect(screen.getByText("From the web")).toBeInTheDocument();
  });

  test("shows both errors when the whole request fails", () => {
    render(
      <RenderQA
        isLoading={false}
        conversation={[
          { question: "q", answer: { ragError: "Network Error", mcpError: "Network Error" } },
        ]}
      />
    );
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
