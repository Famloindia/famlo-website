"use client";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not read the selected image."));
      image.src = typeof reader.result === "string" ? reader.result : "";
    };
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Could not compress the selected image."));
      },
      type,
      quality
    );
  });
}

export async function compressImageForUpload(
  file: File,
  options?: {
    maxWidth?: number;
    quality?: number;
    mimeType?: "image/webp" | "image/jpeg";
  }
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  const maxWidth = options?.maxWidth ?? 1600;
  const quality = options?.quality ?? 0.82;
  const mimeType = options?.mimeType ?? "image/webp";
  const image = await loadImage(file);

  if (image.width <= maxWidth && file.size <= 700 * 1024) {
    return file;
  }

  const scale = Math.min(1, maxWidth / Math.max(1, image.width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");
  if (!context) {
    return file;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await canvasToBlob(canvas, mimeType, quality);
  const extension = mimeType === "image/jpeg" ? "jpg" : "webp";
  const normalizedName = file.name.replace(/\.[^.]+$/, "");

  return new File([blob], `${normalizedName}.${extension}`, {
    type: mimeType,
    lastModified: Date.now(),
  });
}

export async function compressImageListForUpload(files: File[]): Promise<File[]> {
  return Promise.all(files.map((file) => compressImageForUpload(file)));
}
