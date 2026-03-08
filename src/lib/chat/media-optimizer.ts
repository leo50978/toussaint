"use client";

import { recordPerfMetric } from "@/lib/utils/perf-diagnostics";

const MIN_IMAGE_OPTIMIZATION_BYTES = 350_000;
const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_QUALITY = 0.82;
const MIN_IMAGE_SAVINGS_BYTES = 40_000;

function canOptimizeImages() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined" &&
    typeof URL !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined"
  );
}

function getOptimizedImageFileName(fileName: string) {
  const sanitized = fileName.trim();

  if (!sanitized) {
    return `upload-${Date.now()}.webp`;
  }

  const extensionIndex = sanitized.lastIndexOf(".");

  if (extensionIndex <= 0) {
    return `${sanitized}.webp`;
  }

  return `${sanitized.slice(0, extensionIndex)}.webp`;
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Lecture de l image impossible."));
    };

    image.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

export async function optimizeChatUploadFile(file: File) {
  if (!file.type.startsWith("image/") || file.size < MIN_IMAGE_OPTIMIZATION_BYTES) {
    return file;
  }

  if (!canOptimizeImages()) {
    return file;
  }

  try {
    const image = await loadImageElement(file);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale =
      largestSide > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / largestSide : 1;
    const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      return file;
    }

    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await canvasToBlob(canvas, "image/webp", IMAGE_QUALITY);

    if (!blob) {
      return file;
    }

    if (blob.size >= file.size - MIN_IMAGE_SAVINGS_BYTES) {
      recordPerfMetric("chat-media.optimize-image:skip", {
        originalBytes: file.size,
        optimizedBytes: blob.size,
        width: targetWidth,
        height: targetHeight,
      });
      return file;
    }

    const optimizedFile = new File([blob], getOptimizedImageFileName(file.name), {
      type: blob.type || "image/webp",
      lastModified: Date.now(),
    });

    recordPerfMetric("chat-media.optimize-image:ok", {
      originalBytes: file.size,
      optimizedBytes: optimizedFile.size,
      width: targetWidth,
      height: targetHeight,
    });

    return optimizedFile;
  } catch {
    recordPerfMetric("chat-media.optimize-image:skip", {
      originalBytes: file.size,
      reason: "exception",
    });
    return file;
  }
}
