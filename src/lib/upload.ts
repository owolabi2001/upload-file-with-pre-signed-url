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

export const PublicUploadCategory = {
  BLOG_POST_MARKDOWN: "BLOG_POST_MARKDOWN",
  BLOG_ASSET: "BLOG_ASSET",
} as const;

export type PublicUploadCategory =
  (typeof PublicUploadCategory)[keyof typeof PublicUploadCategory];

export const PUBLIC_UPLOAD_CATEGORY_MIME_TYPES: Record<
  PublicUploadCategory,
  readonly string[]
> = {
  [PublicUploadCategory.BLOG_POST_MARKDOWN]: ["text/markdown", "text/plain"],
  [PublicUploadCategory.BLOG_ASSET]: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "video/mp4",
    "video/webm",
  ],
};

export const PUBLIC_UPLOAD_MIN_BYTES = 1;
export const PUBLIC_UPLOAD_MAX_BYTES = 104_857_600;

export const PUBLIC_UPLOAD_CATEGORIES = Object.values(
  PublicUploadCategory,
) as PublicUploadCategory[];

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export const hasFileExtension = (filename: string): boolean => {
  const dot = filename.lastIndexOf(".");
  return dot > 0 && dot < filename.length - 1;
};

export const getAcceptForPublicUploadCategory = (
  category: PublicUploadCategory,
): string => PUBLIC_UPLOAD_CATEGORY_MIME_TYPES[category].join(",");

export const formatAllowedMimeTypes = (
  category: PublicUploadCategory,
): string => PUBLIC_UPLOAD_CATEGORY_MIME_TYPES[category].join(", ");

export const resolvePublicUploadMimeType = (
  file: File,
  category: PublicUploadCategory,
): string | null => {
  const allowed = PUBLIC_UPLOAD_CATEGORY_MIME_TYPES[category];
  if (file.type && allowed.includes(file.type)) {
    return file.type;
  }

  const dot = file.name.lastIndexOf(".");
  if (dot === -1) return null;

  const inferred = EXTENSION_MIME_TYPES[file.name.slice(dot).toLowerCase()];
  if (inferred && allowed.includes(inferred)) {
    return inferred;
  }

  return null;
};

export const validatePublicUploadFile = (
  file: File,
  category: PublicUploadCategory,
): string | null => {
  if (file.size < PUBLIC_UPLOAD_MIN_BYTES) {
    return "File must be at least 1 byte.";
  }
  if (file.size > PUBLIC_UPLOAD_MAX_BYTES) {
    return "File must be 100 MB or smaller.";
  }
  if (category === PublicUploadCategory.BLOG_ASSET && !hasFileExtension(file.name)) {
    return "Assets must include a file extension (e.g. hero.png).";
  }
  if (!resolvePublicUploadMimeType(file, category)) {
    return `File type is not allowed for ${category}. Allowed: ${formatAllowedMimeTypes(category)}`;
  }
  return null;
};

export type InitPublicUploadInput = {
  category: PublicUploadCategory;
  filename: string;
  mimeType: string;
  size: number;
};

export type InitPublicUploadResult = {
  expiresAt: string;
  publicUrl: string;
  storageKey: string;
  uploadId: string;
  uploadUrl: string;
};

export type CompletedPublicUpload = {
  uploadId: string;
  publicUrl: string;
  storageKey: string;
  status: string;
  category: string;
};

const INIT_PUBLIC_UPLOAD_MUTATION = `
  mutation InitPublicUpload($input: InitPublicUploadInput!) {
    initPublicUpload(input: $input) {
      uploadId
      uploadUrl
      storageKey
      publicUrl
      expiresAt
    }
  }
`;

export const initPublicUpload = async (
  endpoint: string,
  input: InitPublicUploadInput,
  token?: string,
): Promise<InitPublicUploadResult> => {
  const data = await graphqlRequest<{ initPublicUpload: InitPublicUploadResult }>(
    endpoint,
    INIT_PUBLIC_UPLOAD_MUTATION,
    { input },
    token,
  );
  return data.initPublicUpload;
};

const COMPLETE_PUBLIC_UPLOAD_MUTATION = `
  mutation CompletePublicUpload($uploadId: ID!) {
    completePublicUpload(uploadId: $uploadId) {
      uploadId
      publicUrl
      storageKey
      status
      category
    }
  }
`;

export const completePublicUpload = async (
  endpoint: string,
  uploadId: string,
  token?: string,
): Promise<CompletedPublicUpload> => {
  const data = await graphqlRequest<{ completePublicUpload: CompletedPublicUpload }>(
    endpoint,
    COMPLETE_PUBLIC_UPLOAD_MUTATION,
    { uploadId },
    token,
  );
  return data.completePublicUpload;
};

/** Blog public upload PUT — Content-Type only (per API docs). */
export const putFileToPresignedUrl = (
  file: File,
  uploadUrl: string,
  mimeType: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", mimeType);

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
