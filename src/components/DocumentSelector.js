import React from "react";
import { Select, Typography } from "antd";

const { Text } = Typography;

const DocumentSelector = ({ documents, selectedDocId, onChange }) => {
  const options = documents.map((doc) => ({
    value: doc.id,
    label: `${doc.name} (${doc.chunkCount} chunks)`,
  }));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <Text strong>Document:</Text>
      <Select
        aria-label="Select document"
        style={{ flex: 1 }}
        placeholder={
          documents.length ? "Select a document" : "Upload a PDF to get started"
        }
        options={options}
        value={selectedDocId ?? undefined}
        onChange={onChange}
        disabled={!documents.length}
        showSearch={{ optionFilterProp: "label" }}
      />
    </div>
  );
};

export default DocumentSelector;
