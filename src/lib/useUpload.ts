import { useCallback, useState } from "react";
import {
  completeUpload,
  computeCrc32Base64,
  computeSha256Hex,
  initUpload,
  uploadToPresignedUrl,
  type CompletedFile,
  type InitUploadResult,
} from "./upload";

export type UploadStatus =
  | "idle"
  | "initializing"
  | "uploading"
  | "completing"
  | "done"
  | "error";

export type UseUploadOptions = {
  endpoint: string;
  token?: string;
};

export type UseUploadResult = {
  status: UploadStatus;
  percent: number;
  result: InitUploadResult | null;
  completedFile: CompletedFile | null;
  error: string | null;
  start: (file: File) => Promise<void>;
  reset: () => void;
};

export const useUpload = ({
  endpoint,
  token,
}: UseUploadOptions): UseUploadResult => {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [percent, setPercent] = useState(0);
  const [result, setResult] = useState<InitUploadResult | null>(null);
  const [completedFile, setCompletedFile] = useState<CompletedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setPercent(0);
    setResult(null);
    setCompletedFile(null);
    setError(null);
  }, []);

  const start = useCallback(
    async (file: File) => {
      setError(null);
      setPercent(0);
      setResult(null);
      setCompletedFile(null);

      try {
        const mimeType = file.type || "application/octet-stream";
        const [crc32Checksum, sha256Checksum] = await Promise.all([
          computeCrc32Base64(file),
          computeSha256Hex(file),
        ]);

        setStatus("initializing");
        const init = await initUpload(
          endpoint,
          {
            filename: file.name,
            originalName: file.name,
            mimeType,
            size: file.size,
          },
          token,
        );
        setResult(init);

        setStatus("uploading");
        await uploadToPresignedUrl(
          file,
          init.uploadUrl,
          { crc32Checksum, contentType: mimeType },
          (progress) => setPercent(progress.percent),
        );

        setStatus("completing");
        const completed = await completeUpload(
          endpoint,
          { fileId: init.fileId, checksum: sha256Checksum },
          token,
        );
        setCompletedFile(completed);

        setStatus("done");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [endpoint, token],
  );

  return { status, percent, result, completedFile, error, start, reset };
};
