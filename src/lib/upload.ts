import CRC32 from "crc-32";

export type InitUploadResult = {
  expiresAt: string;
  fileId: string;
  isMultipart: boolean;
  storageKey: string;
  uploadUrl: string;
};

export type InitUploadInput = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
};

export type CompletedFile = {
  id: string;
  mimeType: string;
  status: string;
};

export type CompleteUploadInput = {
  fileId: string;
  checksum: string;
};

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

const isHeaderSafe = (value: string): boolean =>
  /^[\x20-\x7e]*$/.test(value);

const graphqlRequest = async <T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
  token?: string,
): Promise<T> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    if (!isHeaderSafe(token)) {
      throw new Error(
        "JWT token contains invalid characters. Re-copy the token from its source (it likely picked up a hidden character during paste).",
      );
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: T;
    errors?: Array<{ message: string }>;
  } | null;

  if (payload?.errors?.length) {
    throw new Error(payload.errors.map((e) => e.message).join("; "));
  }
  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status}`);
  }
  if (!payload?.data) {
    throw new Error("GraphQL response missing data");
  }
  return payload.data;
};

const INIT_UPLOAD_MUTATION = `
  mutation InitUpload($input: InitUploadInput!) {
    initUpload(input: $input) {
      expiresAt
      fileId
      isMultipart
      storageKey
      uploadUrl
    }
  }
`;

export const initUpload = async (
  endpoint: string,
  input: InitUploadInput,
  token?: string,
): Promise<InitUploadResult> => {
  const data = await graphqlRequest<{ initUpload: InitUploadResult }>(
    endpoint,
    INIT_UPLOAD_MUTATION,
    { input },
    token,
  );
  return data.initUpload;
};

const COMPLETE_UPLOAD_MUTATION = `
  mutation CompleteUpload($input: CompleteUploadArgs!) {
    completeUpload(input: $input) {
      file {
        id
        mimeType
        status
      }
    }
  }
`;

export const completeUpload = async (
  endpoint: string,
  input: CompleteUploadInput,
  token?: string,
): Promise<CompletedFile> => {
  const data = await graphqlRequest<{ completeUpload: { file: CompletedFile } }>(
    endpoint,
    COMPLETE_UPLOAD_MUTATION,
    { input },
    token,
  );
  return data.completeUpload.file;
};

export const computeCrc32Base64 = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const signed = CRC32.buf(new Uint8Array(buffer));
  const unsigned = signed >>> 0;
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, unsigned, false);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
};

export const computeSha256Hex = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export type UploadOptions = {
  crc32Checksum: string;
  contentType: string;
};

export const uploadToPresignedUrl = (
  file: File,
  uploadUrl: string,
  options: UploadOptions,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", options.contentType);
    xhr.setRequestHeader("x-amz-checksum-crc32", options.crc32Checksum);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
