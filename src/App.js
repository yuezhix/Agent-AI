import React, { useEffect, useState } from "react";
import PdfUploader from "./components/PdfUploader";
import DocumentSelector from "./components/DocumentSelector";
import ChatComponent from "./components/ChatComponent";
import RenderQA from "./components/RenderQA";
import { Layout, Typography } from "antd";
import { fetchDocuments } from "./api";

const chatComponentStyle = {
  position: "fixed",
  bottom: "0",
  width: "80%",
  left: "10%", // this will center it because it leaves 10% space on each side
  marginBottom: "20px",
};

const pdfUploaderStyle = {
  margin: "auto",
  paddingTop: "80px",
};

const documentSelectorStyle = {
  marginTop: "16px",
};

const renderQAStyle = {
  height: "50%", // adjust the height as you see fit
  overflowY: "auto",
};

const App = () => {
  const [conversation, setConversation] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const { Header, Content } = Layout;
  const { Title } = Typography;

  // Load documents that were uploaded (and indexed) before.
  useEffect(() => {
    let cancelled = false;
    fetchDocuments()
      .then((docs) => {
        if (cancelled) return;
        setDocuments(docs);
        setSelectedDocId((prev) => prev ?? docs[0]?.id ?? null);
      })
      .catch((error) => console.error("Failed to load documents:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUploaded = (doc) => {
    setDocuments((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)]);
    setSelectedDocId(doc.id);
  };

  const handleResp = (question, answer) => {
    setConversation((prev) => [
      ...prev,
      { question, answer, documentName: answer?.documentName },
    ]);
  };

  return (
    <>
      <Layout style={{ height: "100vh", backgroundColor: "white" }}>
        <Header
          style={{
            display: "flex",
            alignItems: "center",
          }}
        >
          <Title style={{ color: "white " }}>Agent AI</Title>
        </Header>
        <Content style={{ width: "80%", margin: "auto" }}>
          <div style={pdfUploaderStyle}>
            <PdfUploader onUploaded={handleUploaded} />
          </div>
          <div style={documentSelectorStyle}>
            <DocumentSelector
              documents={documents}
              selectedDocId={selectedDocId}
              onChange={setSelectedDocId}
            />
          </div>

          <br />
          <div style={renderQAStyle}>
            <RenderQA conversation={conversation} isLoading={isLoading} />
          </div>

          <br />
          <br />
        </Content>
        <div style={chatComponentStyle}>
          <ChatComponent
            handleResp={handleResp}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            documentId={selectedDocId}
          />
        </div>
      </Layout>
    </>
  );
};

export default App;
