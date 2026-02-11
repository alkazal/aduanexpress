// src/utils/imageCompressor.js
import imageCompression from "browser-image-compression";

export async function compressImage(file, onProgress = () => {}) {
  if (!file || !file.type.startsWith("image/")) return file;

  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    initialQuality: 0.8,

    onProgress: (percent) => {
      onProgress(Math.round(percent));
    }
  };

  try {
    const compressedFile = await imageCompression(file, options);

    return new File([compressedFile], file.name, {
      type: compressedFile.type
    });

  } catch (err) {
    console.error("Compression failed", err);
    return file;
  }
}
