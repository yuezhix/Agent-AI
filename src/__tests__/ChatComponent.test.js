import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import ChatComponent from "../components/ChatComponent";
import { askQuestion } from "../api";

jest.mock("../api", () => ({ askQuestion: jest.fn() }));

jest.mock("react-speech-recognition", () => ({
  __esModule: true,
  default: { startListening: jest.fn(), stopListening: jest.fn() },
  useSpeechRecognition: jest.fn(),
}));

const mockSpeak = jest.fn();
const mockCancel = jest.fn();
jest.mock("speak-tts", () =>
  class MockSpeech {
    init() {
      return Promise.resolve({});
    }
    speak(options) {
      return mockSpeak(options);
    }
    cancel() {
      return mockCancel();
    }
  }
);

// The jsdom bundled with react-scripts 5 throws on getByRole(name) and userEvent.click/type for
// Ant Design buttons (getComputedStyle on its CSS-in-JS styles), so find buttons by text and use fireEvent.
// eslint-disable-next-line testing-library/no-node-access
const getButton = (text) => screen.getByText(text).closest("button");

// Let the async speak-tts init() finish so the component has a speech instance.
const waitForTtsInit = () => act(() => Promise.resolve());

let speechState;
const setSpeechState = (patch) => {
  speechState = { ...speechState, ...patch };
  useSpeechRecognition.mockImplementation(() => speechState);
};

const renderChat = (props = {}) => {
  const allProps = {
    handleResp: jest.fn(),
    isLoading: false,
    setIsLoading: jest.fn(),
    documentId: "doc-1",
    ...props,
  };
  const utils = render(<ChatComponent {...allProps} />);
  return { ...utils, props: allProps };
};

const answer = { ragAnswer: "RAG answer", ragError: null, mcpAnswer: "Web answer", mcpError: null };

beforeEach(() => {
  setSpeechState({
    transcript: "",
    listening: false,
    resetTranscript: jest.fn(),
    browserSupportsSpeechRecognition: true,
    isMicrophoneAvailable: true,
  });
  mockSpeak.mockResolvedValue();
  askQuestion.mockResolvedValue(answer);
});

describe("text mode", () => {
  test("sends the typed question with the selected document", async () => {
    const { props } = renderChat();
    fireEvent.change(screen.getByPlaceholderText("input search text"), { target: { value: "What is MVP?" } });
    fireEvent.click(getButton("Ask"));

    await waitFor(() => expect(props.handleResp).toHaveBeenCalledWith("What is MVP?", answer));
    expect(askQuestion).toHaveBeenCalledWith("What is MVP?", "doc-1");
    expect(props.setIsLoading).toHaveBeenNthCalledWith(1, true);
    expect(props.setIsLoading).toHaveBeenLastCalledWith(false);
    expect(mockSpeak).not.toHaveBeenCalled(); // no TTS outside Chat Mode
  });

  test("passes partial failures through to the conversation", async () => {
    const partial = { ragAnswer: null, ragError: "OpenAI down", mcpAnswer: "Web answer", mcpError: null };
    askQuestion.mockResolvedValue(partial);
    const { props } = renderChat();
    fireEvent.change(screen.getByPlaceholderText("input search text"), { target: { value: "q" } });
    fireEvent.click(getButton("Ask"));
    await waitFor(() => expect(props.handleResp).toHaveBeenCalledWith("q", partial));
  });

  test("ignores empty questions", () => {
    renderChat();
    fireEvent.change(screen.getByPlaceholderText("input search text"), { target: { value: "   " } });
    fireEvent.click(getButton("Ask"));
    expect(askQuestion).not.toHaveBeenCalled();
  });
});

describe("voice state", () => {
  test("Chat Mode switches from the text box to the record button", async () => {
    renderChat();
    await waitForTtsInit();
    fireEvent.click(getButton("Chat Mode: Off"));

    expect(getButton("Chat Mode: On")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("input search text")).not.toBeInTheDocument();
    expect(getButton(/Click to record/)).toBeInTheDocument();

    fireEvent.click(getButton("Chat Mode: On"));
    expect(screen.getByPlaceholderText("input search text")).toBeInTheDocument();
    expect(SpeechRecognition.stopListening).toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalled();
  });

  test("record button starts and stops listening", () => {
    renderChat();
    fireEvent.click(getButton("Chat Mode: Off"));

    fireEvent.click(getButton(/Click to record/));
    expect(SpeechRecognition.startListening).toHaveBeenCalledTimes(1);
    expect(getButton(/Recording\.\.\./)).toBeInTheDocument();

    fireEvent.click(getButton(/Recording\.\.\./));
    expect(SpeechRecognition.stopListening).toHaveBeenCalled();
    expect(getButton(/Click to record/)).toBeInTheDocument();
  });

  test("finished transcript is sent, the answer is read aloud, then listening restarts", async () => {
    const { props, rerender } = renderChat();
    await waitForTtsInit();
    fireEvent.click(getButton("Chat Mode: Off"));
    fireEvent.click(getButton(/Click to record/));
    SpeechRecognition.startListening.mockClear();

    setSpeechState({ listening: false, transcript: "what is lean startup" });
    rerender(<ChatComponent {...props} />);

    await waitFor(() => expect(askQuestion).toHaveBeenCalledWith("what is lean startup", "doc-1"));
    await waitFor(() => expect(mockSpeak).toHaveBeenCalledWith(expect.objectContaining({ text: "RAG answer" })));
    await waitFor(() => expect(SpeechRecognition.startListening).toHaveBeenCalledTimes(1));
  });

  test("turning Chat Mode off while speaking does not restart listening", async () => {
    let finishSpeaking;
    mockSpeak.mockImplementation(() => new Promise((resolve) => (finishSpeaking = resolve)));
    const { props, rerender } = renderChat();
    await waitForTtsInit();
    fireEvent.click(getButton("Chat Mode: Off"));
    SpeechRecognition.startListening.mockClear();

    setSpeechState({ listening: false, transcript: "hello" });
    rerender(<ChatComponent {...props} />);
    await waitFor(() => expect(mockSpeak).toHaveBeenCalled());

    fireEvent.click(getButton("Chat Mode: On"));
    await act(async () => finishSpeaking());
    expect(SpeechRecognition.startListening).not.toHaveBeenCalled();
  });

  test("Chat Mode is disabled when the browser has no speech recognition", () => {
    setSpeechState({ browserSupportsSpeechRecognition: false });
    renderChat();
    expect(getButton("Chat Mode: Off")).toBeDisabled();
  });

  test("shows a warning when the microphone is blocked", () => {
    setSpeechState({ isMicrophoneAvailable: false });
    renderChat();
    fireEvent.click(getButton("Chat Mode: Off"));
    expect(screen.getByText(/Microphone access is blocked/)).toBeInTheDocument();
    expect(getButton(/Click to record/)).toBeDisabled();
  });
});
