import { useCallback, useState } from "react";
import {
  completePublicUpload,
  initPublicUpload,
  putFileToPresignedUrl,
  resolvePublicUploadMimeType,
  validatePublicUploadFile,
  type CompletedPublicUpload,
  type InitPublicUploadInput,
  type InitPublicUploadResult,
} from "./upload";

export type PublicUploadStatus =
  | "idle"
  | "initializing"
  | "uploading"
  | "completing"
  | "done"
  | "error";

export type UsePublicUploadOptions = {
  endpoint: string;
  token?: string;
  category: InitPublicUploadInput["category"];
};

export type UsePublicUploadResult = {
  status: PublicUploadStatus;
  percent: number;
  initResult: InitPublicUploadResult | null;
  completed: CompletedPublicUpload | null;
  error: string | null;
  start: (file: File) => Promise<void>;
  reset: () => void;
};

export const usePublicUpload = ({
  endpoint,
  token,
  category,
}: UsePublicUploadOptions): UsePublicUploadResult => {
  const [status, setStatus] = useState<PublicUploadStatus>("idle");
  const [percent, setPercent] = useState(0);
  const [initResult, setInitResult] = useState<InitPublicUploadResult | null>(null);
  const [completed, setCompleted] = useState<CompletedPublicUpload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setPercent(0);
    setInitResult(null);
    setCompleted(null);
    setError(null);
  }, []);

  const start = useCallback(
    async (file: File) => {
      setError(null);
      setPercent(0);
      setInitResult(null);
      setCompleted(null);

      const validationError = validatePublicUploadFile(file, category);
      if (validationError) {
        setStatus("error");
        setError(validationError);
        return;
      }

      const mimeType = resolvePublicUploadMimeType(file, category);
      if (!mimeType) {
        setStatus("error");
        setError("Could not determine a valid MIME type for this file.");
        return;
      }

      try {
        setStatus("initializing");
        const init = await initPublicUpload(
          endpoint,
          {
            category,
            filename: file.name,
            mimeType,
            size: file.size,
          },
          token,
        );
        console.log("init", init);
        setInitResult(init);
        console.log("initPublicUpload response:", init);

        setStatus("uploading");
        await putFileToPresignedUrl(
          file,
          init.uploadUrl,
          mimeType,
          (progress) => setPercent(progress.percent),
        );

        setStatus("completing");
        const result = await completePublicUpload(endpoint, init.uploadId, token);
        setCompleted(result);

        setStatus("done");
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    },
    [endpoint, token, category],
  );

  return { status, percent, initResult, completed, error, start, reset };
};
