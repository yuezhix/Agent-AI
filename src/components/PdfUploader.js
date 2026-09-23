import React from "react";
import { InboxOutlined } from "@ant-design/icons";
import { message, Upload } from "antd";
import { uploadDocument, getErrorMessage } from "../api";

const { Dragger } = Upload;

const isPdf = (file) =>
  file.type === "application/pdf" || /\.pdf$/i.test(file.name);

const PdfUploader = ({ onUploaded }) => {
  const beforeUpload = (file) => {
    if (!isPdf(file)) {
      message.error(`${file.name} is not a PDF file.`);
      return Upload.LIST_IGNORE;
    }
    return true;
  };

  const customRequest = async ({ file, onSuccess, onError }) => {
    try {
      const doc = await uploadDocument(file);
      onSuccess(doc);
      message.success(`${doc.name} uploaded and indexed (${doc.chunkCount} chunks).`);
      onUploaded?.(doc);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      onError(new Error(errorMessage));
      message.error(`${file.name} upload failed: ${errorMessage}`);
    }
  };

  return (
    <Dragger
      name="file"
      multiple
      accept=".pdf,application/pdf"
      beforeUpload={beforeUpload}
      customRequest={customRequest}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">Click or drag PDF files to this area to upload</p>
      <p className="ant-upload-hint">
        Each PDF is indexed once when uploaded, then can be selected below for
        questions. Strictly prohibited from uploading company data or other
        banned files.
      </p>
    </Dragger>
  );
};

export default PdfUploader;
