import { useEffect, useRef, useState } from "react";
import "./App.css";
import { CopyButton } from "./lib/CopyButton";
import { usePublicUpload } from "./lib/usePublicUpload";
import { useUpload } from "./lib/useUpload";
import {
  formatAllowedMimeTypes,
  getAcceptForPublicUploadCategory,
  PUBLIC_UPLOAD_CATEGORIES,
  PUBLIC_UPLOAD_MAX_BYTES,
  PublicUploadCategory,
} from "./lib/upload";

const DEFAULT_ENDPOINT = "/graphql";
const STORAGE_KEY_ENDPOINT = "upload-tester:endpoint";
const STORAGE_KEY_TOKEN = "upload-tester:token";
const STORAGE_KEY_ADMIN_TOKEN = "upload-tester:admin-token";

type Mode = "private" | "public";

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

const isBusyStatus = (status: string): boolean =>
  status === "initializing" || status === "uploading" || status === "completing";

const busyButtonLabel = (status: string, percent: number, idleLabel: string): string => {
  if (status === "initializing") return "Initializing…";
  if (status === "uploading") return `Uploading… ${percent}%`;
  if (status === "completing") return "Finalizing…";
  return idleLabel;
};

export default function App() {
  const [mode, setMode] = useState<Mode>("private");
  const [endpoint, setEndpoint] = useState(loadInitialEndpoint);
  const [token, setToken] = useState(
    () => localStorage.getItem(STORAGE_KEY_TOKEN) ?? "",
  );
  const [adminToken, setAdminToken] = useState(
    () => localStorage.getItem(STORAGE_KEY_ADMIN_TOKEN) ?? "",
  );
  const [category, setCategory] = useState<PublicUploadCategory>(
    PublicUploadCategory.BLOG_POST_MARKDOWN,
  );
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ENDPOINT, endpoint);
  }, [endpoint]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TOKEN, token);
  }, [token]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ADMIN_TOKEN, adminToken);
  }, [adminToken]);

  const sanitizedToken = token.replace(/\s+/g, "") || undefined;
  const sanitizedAdminToken = adminToken.replace(/\s+/g, "") || undefined;

  const privateUpload = useUpload({ endpoint, token: sanitizedToken });
  const publicUpload = usePublicUpload({
    endpoint,
    token: sanitizedAdminToken,
    category,
  });

  const active = mode === "private" ? privateUpload : publicUpload;
  const isBusy = isBusyStatus(active.status);

  const handleModeChange = (next: Mode) => {
    setMode(next);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    privateUpload.reset();
    publicUpload.reset();
  };

  const handleStart = () => {
    if (file) active.start(file);
  };

  const handleReset = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    active.reset();
  };

  const buttonLabel = busyButtonLabel(
    active.status,
    active.percent,
    mode === "private" ? "Upload to MinIO" : "Upload public file",
  );

  return (
    <div className="page">
      <div className="card">
        <header className="card__header">
          <h1 className="card__title">MinIO Upload Tester</h1>
          <p className="card__subtitle">
            {mode === "private"
              ? "Initializes via GraphQL, then PUTs the file to the presigned URL."
              : "Admin blog upload: initPublicUpload → PUT → completePublicUpload. Copy publicUrl for createBlogPost / createBlogAsset."}
          </p>
        </header>

        <div className="tabs" role="tablist" aria-label="Upload mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "private"}
            className={`tabs__tab${mode === "private" ? " tabs__tab--active" : ""}`}
            onClick={() => handleModeChange("private")}
            disabled={isBusy}
          >
            Private upload
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "public"}
            className={`tabs__tab${mode === "public" ? " tabs__tab--active" : ""}`}
            onClick={() => handleModeChange("public")}
            disabled={isBusy}
          >
            Public admin upload
          </button>
        </div>

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

          {mode === "private" ? (
            <div className="field">
              <label className="field__label" htmlFor="token">
                JWT token{" "}
                <span className="field__hint">(sent as Authorization: Bearer)</span>
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
          ) : (
            <>
              <div className="field">
                <label className="field__label" htmlFor="admin-token">
                  Admin JWT token{" "}
                  <span className="field__hint">(sent as Authorization: Bearer)</span>
                </label>
                <input
                  id="admin-token"
                  className="field__input field__input--mono"
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                  value={adminToken}
                  onChange={(event) => setAdminToken(event.target.value)}
                  disabled={isBusy}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor="category">
                  Category
                </label>
                <select
                  id="category"
                  className="field__input"
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value as PublicUploadCategory);
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                    publicUpload.reset();
                  }}
                  disabled={isBusy}
                >
                  {PUBLIC_UPLOAD_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <span className="field__hint">
                  {category === PublicUploadCategory.BLOG_POST_MARKDOWN
                    ? "Post body markdown"
                    : "Images / videos for the asset library"}
                  {" · "}
                  {formatAllowedMimeTypes(category)} · 1 byte – 100 MB
                  {category === PublicUploadCategory.BLOG_ASSET
                    ? " · filename must include an extension"
                    : ""}
                </span>
              </div>
            </>
          )}

          <div className="field">
            <label className="field__label">File</label>
            <label className="dropzone">
              <strong>{file ? "Choose a different file" : "Click to choose a file"}</strong>
              <span className="dropzone__hint">
                {mode === "public"
                  ? `${formatAllowedMimeTypes(category)} · max ${formatBytes(PUBLIC_UPLOAD_MAX_BYTES)}`
                  : "Any file type, any size"}
              </span>
              <input
                ref={inputRef}
                type="file"
                accept={
                  mode === "public"
                    ? getAcceptForPublicUploadCategory(category)
                    : undefined
                }
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  active.reset();
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

          {(active.status === "uploading" ||
            active.status === "completing" ||
            active.status === "done") && (
            <div className="progress">
              <div className="progress__bar">
                <div
                  className="progress__fill"
                  style={{
                    width: `${active.status === "uploading" ? active.percent : 100}%`,
                  }}
                />
              </div>
              <div className="progress__meta">
                <span>
                  {active.status === "uploading"
                    ? "Transferring"
                    : active.status === "completing"
                      ? "Finalizing"
                      : "Complete"}
                </span>
                <span>{active.status === "uploading" ? active.percent : 100}%</span>
              </div>
            </div>
          )}

          {active.status === "done" && (
            <div className="status status--success">
              {mode === "private"
                ? "Upload complete and finalized on the server."
                : "Upload complete (AVAILABLE). Use publicUrl below in createBlogPost, createBlogAsset, or updateBlogPost."}
            </div>
          )}

          {mode === "private" && privateUpload.completedFile && (
            <div className="completed">
              <div className="completed__header">
                <span className="completed__label">Finalized File</span>
                <span
                  className={`completed__badge completed__badge--${privateUpload.completedFile.status.toLowerCase()}`}
                >
                  {privateUpload.completedFile.status}
                </span>
              </div>
              <div className="completed__rows">
                <div className="result__row">
                  <span className="result__key">id</span>
                  <span className="result__value">{privateUpload.completedFile.id}</span>
                  <CopyButton
                    value={privateUpload.completedFile.id}
                    className="result__copy"
                  />
                </div>
                <div className="result__row">
                  <span className="result__key">mimeType</span>
                  <span className="result__value">
                    {privateUpload.completedFile.mimeType}
                  </span>
                </div>
              </div>
            </div>
          )}

          {mode === "public" && publicUpload.completed && (
            <div className="public-url">
              <div className="public-url__header">
                <span className="public-url__label">Public URL</span>
                <CopyButton
                  value={publicUpload.completed.publicUrl}
                  className="button button--ghost button--sm"
                />
              </div>
              <a
                className="public-url__link"
                href={publicUpload.completed.publicUrl}
                target="_blank"
                rel="noreferrer"
              >
                {publicUpload.completed.publicUrl}
              </a>
            </div>
          )}

          {mode === "public" && publicUpload.completed && (
            <div className="completed">
              <div className="completed__header">
                <span className="completed__label">Upload details</span>
                <span
                  className={`completed__badge completed__badge--${publicUpload.completed.status.toLowerCase()}`}
                >
                  {publicUpload.completed.status}
                </span>
              </div>
              <div className="completed__rows">
                <div className="result__row">
                  <span className="result__key">uploadId</span>
                  <span className="result__value">{publicUpload.completed.uploadId}</span>
                  <CopyButton
                    value={publicUpload.completed.uploadId}
                    className="result__copy"
                  />
                </div>
                <div className="result__row">
                  <span className="result__key">category</span>
                  <span className="result__value">{publicUpload.completed.category}</span>
                </div>
                <div className="result__row">
                  <span className="result__key">storageKey</span>
                  <span className="result__value">{publicUpload.completed.storageKey}</span>
                  <CopyButton
                    value={publicUpload.completed.storageKey}
                    className="result__copy"
                  />
                </div>
              </div>
            </div>
          )}

          {active.status === "error" && active.error && (
            <div className="status status--error">{active.error}</div>
          )}

          {mode === "private" && privateUpload.result && (
            <>
              <div className="file-id">
                <div className="file-id__header">
                  <span className="file-id__label">File ID</span>
                  <CopyButton
                    value={privateUpload.result.fileId}
                    className="button button--ghost button--sm"
                  />
                </div>
                <code className="file-id__value">{privateUpload.result.fileId}</code>
              </div>

              <div className="result">
                <div className="result__row">
                  <span className="result__key">storageKey</span>
                  <span className="result__value">{privateUpload.result.storageKey}</span>
                  <CopyButton
                    value={privateUpload.result.storageKey}
                    className="result__copy"
                  />
                </div>
                <div className="result__row">
                  <span className="result__key">expiresAt</span>
                  <span className="result__value">{privateUpload.result.expiresAt}</span>
                  <CopyButton
                    value={privateUpload.result.expiresAt}
                    className="result__copy"
                  />
                </div>
              </div>
            </>
          )}

          {mode === "public" && publicUpload.initResult && (
            <div className="result">
              <div className="result__row">
                <span className="result__key">uploadId</span>
                <span className="result__value">{publicUpload.initResult.uploadId}</span>
                <CopyButton
                  value={publicUpload.initResult.uploadId}
                  className="result__copy"
                />
              </div>
              <div className="result__row">
                <span className="result__key">expiresAt</span>
                <span className="result__value">{publicUpload.initResult.expiresAt}</span>
                <CopyButton
                  value={publicUpload.initResult.expiresAt}
                  className="result__copy"
                />
              </div>
            </div>
          )}

          <div className="actions">
            <button
              className="button"
              onClick={handleStart}
              disabled={
                !file ||
                isBusy ||
                (mode === "public" && !sanitizedAdminToken)
              }
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
