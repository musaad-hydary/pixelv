import { FB_WIDTH, FB_HEIGHT } from "./cpu";

// copies the CPU framebuffer onto an HTML canvas.
export function blitToCanvas(fb: Uint32Array, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const imageData = ctx.createImageData(FB_WIDTH, FB_HEIGHT);
  const pixels = imageData.data; // Uint8ClampedArray

  for (let i = 0; i < fb.length; i++) {
    const px = fb[i] >>> 0;
    const base = i * 4;
    pixels[base + 0] = (px >>> 16) & 0xff; // R
    pixels[base + 1] = (px >>> 8) & 0xff; // G
    pixels[base + 2] = px & 0xff; // B
    pixels[base + 3] = 0xff; // A
  }

  ctx.putImageData(imageData, 0, 0);
}

// exports the canvas as a png the user can download!
export function exportPNG(canvas: HTMLCanvasElement): void {
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = "pixel-v-output.png";
  a.click();
}
