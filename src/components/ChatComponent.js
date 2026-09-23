import React, { useState, useEffect, useRef } from "react";
import { Button, Input, Tooltip, Typography } from "antd";
import { AudioOutlined } from "@ant-design/icons";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import Speech from "speak-tts";
import { askQuestion } from "../api";

const { Search } = Input;
const { Text } = Typography;

const searchContainer = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const ChatComponent = (props) => {
  const { handleResp, isLoading, setIsLoading, documentId } = props;
  // Define a state variable to keep track of the search value
  const [searchValue, setSearchValue] = useState("");
  const [isChatModeOn, setIsChatModeOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [speech, setSpeech] = useState();

  // Async callbacks (TTS finished, request finished) read the latest mode from this ref,
  // so turning Chat Mode off stops the listen -> answer -> speak loop.
  const isChatModeOnRef = useRef(isChatModeOn);
  useEffect(() => {
    isChatModeOnRef.current = isChatModeOn;
  }, [isChatModeOn]);

  // speech recognition
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
  } = useSpeechRecognition();

  useEffect(() => {
    let cancelled = false;
    const initialized_speech = new Speech();
    const options = {
      volume: 1,
      lang: "en-US",
      rate: 1,
      pitch: 1,
      voice: "Google US English",
      splitSentences: false,
    };
    initialized_speech
      .init(options)
      .catch(() => {
        // "Google US English" only exists in Chrome; fall back to the default en-US voice.
        const { voice, ...fallback } = options;
        return initialized_speech.init(fallback);
      })
      .then((data) => {
        // The "data" object contains the list of available voices and the voice synthesis params
        console.log("Speech is ready, voices are available", data);
        if (!cancelled) setSpeech(initialized_speech);
      })
      .catch((e) => {
        console.error("An error occured while initializing : ", e);
      });
    return () => {
      cancelled = true;
      initialized_speech.cancel?.();
    };
  }, []);

  const userStartConvo = () => {
    if (!isChatModeOnRef.current) return;
    resetTranscript();
    SpeechRecognition.startListening();
    setIsRecording(true);
  };

  const talk = (what2say) => {
    // TTS not ready or nothing to read: go straight back to listening.
    if (!speech || !what2say) {
      userStartConvo();
      return;
    }
    speech
      .speak({
        text: what2say,
        queue: false, // current speech will be interrupted
      })
      .then(() => {
        // if everything went well, start listening again
        userStartConvo();
      })
      .catch((e) => {
        console.error("An error occurred :", e);
      });
  };

  const onSearch = async (rawQuestion) => {
    const question = (rawQuestion || "").trim();
    if (!question || isLoading) return;

    // Clear the search input
    setSearchValue("");
    setIsLoading(true);
    try {
      // askQuestion never throws; failed parts come back as ragError / mcpError.
      const answer = await askQuestion(question, documentId);
      handleResp(question, answer);
      if (isChatModeOnRef.current) {
        talk(answer.ragAnswer || answer.mcpAnswer);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Keep the latest onSearch in a ref so the transcript effect does not depend on it.
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    if (!listening && Boolean(transcript)) {
      onSearchRef.current(transcript);
      resetTranscript();
      setIsRecording(false);
    }
  }, [listening, transcript, resetTranscript]);

  const chatModeClickHandler = () => {
    const nextMode = !isChatModeOn;
    isChatModeOnRef.current = nextMode;
    setIsChatModeOn(nextMode);
    setIsRecording(false);
    SpeechRecognition.stopListening();
    speech?.cancel?.();
    resetTranscript();
  };

  const recordingClickHandler = () => {
    if (isRecording) {
      setIsRecording(false);
      SpeechRecognition.stopListening();
      resetTranscript();
    } else {
      setIsRecording(true);
      SpeechRecognition.startListening();
    }
  };

  const handleChange = (e) => {
    // Update searchValue state when the user types in the input box
    setSearchValue(e.target.value);
  };

  const chatModeButton = (
    <Button
      type="primary"
      size="large"
      danger={isChatModeOn}
      onClick={chatModeClickHandler}
      disabled={!browserSupportsSpeechRecognition}
      style={{ marginLeft: "5px" }}
    >
      Chat Mode: {isChatModeOn ? "On" : "Off"}
    </Button>
  );

  return (
    <div style={searchContainer}>
      {!isChatModeOn && (
        <Search
          placeholder="input search text"
          enterButton="Ask"
          size="large"
          onSearch={onSearch}
          loading={isLoading}
          value={searchValue} // Control the value
          onChange={handleChange} // Update the value when changed
        />
      )}
      {browserSupportsSpeechRecognition ? (
        chatModeButton
      ) : (
        <Tooltip title="Speech recognition is not supported in this browser">
          <span>{chatModeButton}</span>
        </Tooltip>
      )}
      {isChatModeOn && (
        <Button
          type="primary"
          icon={<AudioOutlined />}
          size="large"
          danger={isRecording}
          onClick={recordingClickHandler}
          disabled={!isMicrophoneAvailable}
          style={{ marginLeft: "5px" }}
        >
          {isRecording ? "Recording..." : "Click to record"}
        </Button>
      )}
      {isChatModeOn && !isMicrophoneAvailable && (
        <Text type="danger" style={{ marginLeft: "8px" }}>
          Microphone access is blocked. Allow it in the browser settings.
        </Text>
      )}
    </div>
  );
};

export default ChatComponent;
