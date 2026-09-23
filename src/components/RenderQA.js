import React from "react";
import { Spin } from "antd";

const containerStyle = {
  display: "flex",
  justifyContent: "space-between",
  flexDirection: "column",
  marginBottom: "20px",
};

const userContainer = {
  textAlign: "right",
};

const agentContainer = {
  textAlign: "left",
};

const userStyle = {
  maxWidth: "50%",
  textAlign: "left",
  backgroundColor: "#1677FF",
  color: "white",
  display: "inline-block",
  borderRadius: "10px",
  padding: "10px",
  marginBottom: "10px",
};

const answerContainer = {
  marginBottom: "10px",
};

const answerLabel = {
  fontSize: "12px",
  fontWeight: "bold",
  color: "#666",
  marginBottom: "5px",
};

const bubbleStyle = {
  maxWidth: "50%",
  textAlign: "left",
  color: "black",
  display: "inline-block",
  borderRadius: "10px",
  padding: "10px",
  marginBottom: "5px",
};

const ragAnswerStyle = {
  ...bubbleStyle,
  backgroundColor: "#E6F7FF",
  borderLeft: "4px solid #1890FF",
};

const mcpAnswerStyle = {
  ...bubbleStyle,
  backgroundColor: "#F6FFED",
  borderLeft: "4px solid #52C41A",
};

const errorStyle = {
  ...bubbleStyle,
  backgroundColor: "#FFF2F0",
  borderLeft: "4px solid #FF4D4F",
  color: "#A8071A",
};

const AnswerBlock = ({ label, text, error, style }) => (
  <div style={answerContainer}>
    <div style={answerLabel}>{label}</div>
    {error ? (
      <div style={errorStyle} role="alert">
        Failed: {error}
      </div>
    ) : (
      <div style={style}>{text}</div>
    )}
  </div>
);

const RenderQA = (props) => {
  const { conversation, isLoading } = props;

  return (
    <>
      {conversation?.map((each, index) => {
        const { answer = {} } = each;
        const docLabel = each.documentName
          ? `RAG Answer (from ${each.documentName}):`
          : "RAG Answer (from document):";
        return (
          <div key={index} style={containerStyle}>
            <div style={userContainer}>
              <div style={userStyle}>{each.question}</div>
            </div>
            <div style={agentContainer}>
              <AnswerBlock
                label={docLabel}
                text={answer.ragAnswer}
                error={answer.ragError}
                style={ragAnswerStyle}
              />
              <AnswerBlock
                label="MCP Answer (with web search):"
                text={answer.mcpAnswer}
                error={answer.mcpError}
                style={mcpAnswerStyle}
              />
            </div>
          </div>
        );
      })}
      {isLoading && <Spin size="large" style={{ margin: "10px" }} />}
    </>
  );
};

export default RenderQA;
