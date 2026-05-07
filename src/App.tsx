import { useEffect, useRef, useState } from "react";
import "./App.css";
import { CopyButton } from "./lib/CopyButton";
import { useUpload } from "./lib/useUpload";

const DEFAULT_ENDPOINT = "/graphql";
const STORAGE_KEY_ENDPOINT = "upload-tester:endpoint";
const STORAGE_KEY_TOKEN = "upload-tester:token";

const loadInitialEndpoint = (): string => {
  const stored = localStorage.getItem(STORAGE_KEY_ENDPOINT);
  if (!stored || stored.includes("localhost:20000")) return DEFAULT_ENDPOINT;
  return stored;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export default function App() {
  const [endpoint, setEndpoint] = useState(loadInitialEndpoint);
  const [token, setToken] = useState(
    () => localStorage.getItem(STORAGE_KEY_TOKEN) ?? "",
  );
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ENDPOINT, endpoint);
  }, [endpoint]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
  }, [token]);

  const sanitizedToken = token.replace(/\s+/g, "") || undefined;

  const { status, percent, result, completedFile, error, start, reset } =
    useUpload({
      endpoint,
      token: sanitizedToken,
    });

  const isBusy =
    status === "initializing" ||
    status === "uploading" ||
    status === "completing";

  const handleStart = () => {
    if (file) start(file);
  };

  const handleReset = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    reset();
  };

  const buttonLabel =
    status === "initializing"
      ? "Initializing…"
      : status === "uploading"
        ? `Uploading… ${percent}%`
        : status === "completing"
          ? "Finalizing…"
          : "Upload to MinIO";

  return (
    <div className="page">
      <div className="card">
        <header className="card__header">
          <h1 className="card__title">MinIO Upload Tester</h1>
          <p className="card__subtitle">
            Initializes via GraphQL, then PUTs the file to the presigned URL.
          </p>
        </header>

        <div className="card__body">
          <div className="field">
            <label className="field__label" htmlFor="endpoint">
              GraphQL endpoint
            </label>
            <input
              id="endpoint"
              className="field__input"
              type="text"
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value)}
              disabled={isBusy}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="token">
              JWT token <span className="field__hint">(sent as Authorization: Bearer)</span>
            </label>
            <input
              id="token"
              className="field__input field__input--mono"
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR..."
              value={token}
              onChange={(event) => setToken(event.target.value)}
              disabled={isBusy}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="field">
            <label className="field__label">File</label>
            <label className="dropzone">
              <strong>{file ? "Choose a different file" : "Click to choose a file"}</strong>
              <span className="dropzone__hint">Any file type, any size</span>
              <input
                ref={inputRef}
                type="file"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  reset();
                }}
                disabled={isBusy}
              />
            </label>

            {file && (
              <div className="file-info">
                <span className="file-info__name">{file.name}</span>
                <span>
                  {formatBytes(file.size)} · {file.type || "unknown type"}
                </span>
              </div>
            )}
          </div>

          {(status === "uploading" ||
            status === "completing" ||
            status === "done") && (
            <div className="progress">
              <div className="progress__bar">
                <div
                  className="progress__fill"
                  style={{
                    width: `${status === "uploading" ? percent : 100}%`,
                  }}
                />
              </div>
              <div className="progress__meta">
                <span>
                  {status === "uploading"
                    ? "Transferring"
                    : status === "completing"
                      ? "Finalizing"
                      : "Complete"}
                </span>
                <span>{status === "uploading" ? percent : 100}%</span>
              </div>
            </div>
          )}

          {status === "done" && (
            <div className="status status--success">
              Upload complete and finalized on the server.
            </div>
          )}

          {completedFile && (
            <div className="completed">
              <div className="completed__header">
                <span className="completed__label">Finalized File</span>
                <span
                  className={`completed__badge completed__badge--${completedFile.status.toLowerCase()}`}
                >
                  {completedFile.status}
                </span>
              </div>
              <div className="completed__rows">
                <div className="result__row">
                  <span className="result__key">id</span>
                  <span className="result__value">{completedFile.id}</span>
                  <CopyButton
                    value={completedFile.id}
                    className="result__copy"
                  />
                </div>
                <div className="result__row">
                  <span className="result__key">mimeType</span>
                  <span className="result__value">{completedFile.mimeType}</span>
                </div>
              </div>
            </div>
          )}

          {status === "error" && error && (
            <div className="status status--error">{error}</div>
          )}

          {result && (
            <>
              <div className="file-id">
                <div className="file-id__header">
                  <span className="file-id__label">File ID</span>
                  <CopyButton
                    value={result.fileId}
                    className="button button--ghost button--sm"
                  />
                </div>
                <code className="file-id__value">{result.fileId}</code>
              </div>

              <div className="result">
                <div className="result__row">
                  <span className="result__key">storageKey</span>
                  <span className="result__value">{result.storageKey}</span>
                  <CopyButton
                    value={result.storageKey}
                    className="result__copy"
                  />
                </div>
                <div className="result__row">
                  <span className="result__key">expiresAt</span>
                  <span className="result__value">{result.expiresAt}</span>
                  <CopyButton
                    value={result.expiresAt}
                    className="result__copy"
                  />
                </div>
              </div>
            </>
          )}

          <div className="actions">
            <button
              className="button"
              onClick={handleStart}
              disabled={!file || isBusy}
              style={{ flex: 1 }}
            >
              {buttonLabel}
            </button>
            <button
              className="button button--ghost"
              onClick={handleReset}
              disabled={isBusy}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
