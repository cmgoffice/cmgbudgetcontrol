// @ts-nocheck
/**
 * Utility functions for combining multiple images into a single PDF
 */
import { PDFDocument, rgb } from "pdf-lib";

/**
 * Convert a File object to ArrayBuffer
 */
async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Combine multiple image files into a single PDF, or append to existing PDF
 * Each image will be placed on a separate page
 * @param imageFiles Array of image File objects
 * @param options Configuration options
 * @returns PDF bytes as Uint8Array
 */
export async function combineImagesToPdf(
  imageFiles: File[],
  options: {
    title?: string;
    pageSize?: { width: number; height: number };
    margin?: number;
    maintainAspectRatio?: boolean;
    existingPdfBytes?: Uint8Array;
  } = {}
): Promise<Uint8Array> {
  const {
    title = "Combined Images",
    pageSize = { width: 595, height: 842 }, // A4 size
    margin = 20,
    maintainAspectRatio = true,
    existingPdfBytes
  } = options;

  if (!imageFiles || imageFiles.length === 0) {
    if (existingPdfBytes) {
      // If no images but existing PDF provided, just return the existing PDF
      return existingPdfBytes;
    }
    throw new Error("No image files provided");
  }

  // Load existing PDF or create new one
  const pdfDoc = existingPdfBytes 
    ? await PDFDocument.load(existingPdfBytes)
    : await PDFDocument.create();
  
  // Set document metadata
  pdfDoc.setTitle(title);
  pdfDoc.setCreator("CMG Budget Control System");
  pdfDoc.setProducer("pdf-lib");

  for (const imageFile of imageFiles) {
    try {
      // Convert file to ArrayBuffer
      const imageBytes = await fileToArrayBuffer(imageFile);
      
      // Embed the image based on file type
      let embeddedImage;
      const fileType = imageFile.type.toLowerCase();
      
      if (fileType.includes('png')) {
        embeddedImage = await pdfDoc.embedPng(imageBytes);
      } else if (fileType.includes('jpg') || fileType.includes('jpeg')) {
        embeddedImage = await pdfDoc.embedJpg(imageBytes);
      } else {
        // Try PNG first, then JPG as fallback
        try {
          embeddedImage = await pdfDoc.embedPng(imageBytes);
        } catch {
          try {
            embeddedImage = await pdfDoc.embedJpg(imageBytes);
          } catch {
            console.warn(`Unsupported image format for file: ${imageFile.name}`);
            continue; // Skip this image
          }
        }
      }

      // Create a new page for this image
      const page = pdfDoc.addPage([pageSize.width, pageSize.height]);
      
      // Calculate available space for the image
      const availableWidth = pageSize.width - (margin * 2);
      const availableHeight = pageSize.height - (margin * 2);
      
      // Get image dimensions
      const imageDims = embeddedImage.scale(1);
      
      let drawWidth = availableWidth;
      let drawHeight = availableHeight;
      
      if (maintainAspectRatio) {
        // Calculate scaling to fit within available space while maintaining aspect ratio
        const scaleX = availableWidth / imageDims.width;
        const scaleY = availableHeight / imageDims.height;
        const scale = Math.min(scaleX, scaleY);
        
        drawWidth = imageDims.width * scale;
        drawHeight = imageDims.height * scale;
      }
      
      // Center the image on the page
      const x = (pageSize.width - drawWidth) / 2;
      const y = (pageSize.height - drawHeight) / 2;
      
      // Draw the image
      page.drawImage(embeddedImage, {
        x,
        y,
        width: drawWidth,
        height: drawHeight,
      });
      
      // Optional: Add image filename as footer
      const fontSize = 8;
      const textWidth = imageFile.name.length * fontSize * 0.6; // Rough estimate
      page.drawText(imageFile.name, {
        x: (pageSize.width - textWidth) / 2,
        y: margin / 2,
        size: fontSize,
        color: rgb(0.5, 0.5, 0.5),
      });
      
    } catch (error) {
      console.error(`Error processing image ${imageFile.name}:`, error);
      // Continue with other images even if one fails
    }
  }

  if (pdfDoc.getPages().length === 0) {
    throw new Error("No valid images could be processed");
  }

  return await pdfDoc.save();
}

/**
 * Create a thumbnail image from PDF bytes
 * This is a placeholder - actual thumbnail generation would require additional libraries
 * For now, we'll return a data URL representing a generic PDF icon
 */
export function createPdfThumbnail(pdfBytes: Uint8Array): string {
  // This is a simple SVG-based PDF icon as a data URL
  // In a real implementation, you might want to use pdf2pic or similar library
  const svgIcon = `
    <svg width="100" height="120" viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="70" height="90" fill="#f0f0f0" stroke="#ccc" stroke-width="2" rx="4"/>
      <rect x="15" y="15" width="60" height="4" fill="#e74c3c"/>
      <rect x="15" y="25" width="45" height="2" fill="#666"/>
      <rect x="15" y="30" width="50" height="2" fill="#666"/>
      <rect x="15" y="35" width="40" height="2" fill="#666"/>
      <rect x="15" y="45" width="55" height="2" fill="#666"/>
      <rect x="15" y="50" width="35" height="2" fill="#666"/>
      <rect x="15" y="55" width="45" height="2" fill="#666"/>
      <text x="50" y="80" text-anchor="middle" font-family="Arial" font-size="12" fill="#e74c3c">PDF</text>
      <text x="50" y="95" text-anchor="middle" font-family="Arial" font-size="8" fill="#666">${Math.ceil(pdfBytes.length / 1024)}KB</text>
    </svg>
  `;
  
  return `data:image/svg+xml;base64,${btoa(svgIcon)}`;
}

/**
 * Generate a filename for the combined PDF
 */
export function generateCombinedPdfFilename(prefix: string = "combined", extension: string = "pdf"): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const timeString = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
  return `${prefix}_${timestamp}_${timeString}.${extension}`;
}
