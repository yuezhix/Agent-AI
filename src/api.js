import axios from "axios";

// In development, requests go to the same origin and the CRA dev server proxies them to
// the backend ("proxy" in package.json), so no CORS or port issues. Otherwise call port 5001
// on the same host. REACT_APP_API_URL overrides both.
const defaultApiUrl = () => {
  if (process.env.NODE_ENV === "development") return "";
  const host =
    typeof window !== "undefined" && window.location.hostname
      ? window.location.hostname
      : "localhost";
  return `http://${host}:5001`;
};

export const API_BASE_URL = process.env.REACT_APP_API_URL ?? defaultApiUrl();

export const getErrorMessage = (error) =>
  error?.response?.data?.error || error?.message || "Request failed";

export const fetchDocuments = async () => {
  const response = await axios.get(`${API_BASE_URL}/documents`);
  return response.data;
};

export const uploadDocument = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await axios.post(`${API_BASE_URL}/upload`, formData);
  return response.data;
};

// Always resolves to { ragAnswer, ragError, mcpAnswer, mcpError } so the UI can show partial results.
export const askQuestion = async (question, documentId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/chat`, {
      params: { question, ...(documentId && { documentId }) },
    });
    return response.data;
  } catch (error) {
    const data = error?.response?.data;
    if (data && ("ragError" in data || "mcpError" in data)) {
      return data; // 502: both answers failed, but the server explained each one
    }
    const message = getErrorMessage(error);
    return {
      ragAnswer: null,
      ragError: message,
      mcpAnswer: null,
      mcpError: message,
    };
  }
};
