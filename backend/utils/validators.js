import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  message: z.string().trim().min(10).max(1000)
});

export function isValidIp(value) {
  if (typeof value !== "string") return false;

  const ipv4 =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const ipv6 =
    /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::1|::|([0-9a-fA-F]{1,4}:){1,7}:)$/;

  return ipv4.test(value.trim()) || ipv6.test(value.trim());
}

export function detectImage(buffer) {
  if (!buffer || buffer.length < 12) return null;

  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isGif =
    buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
    buffer.subarray(0, 6).toString("ascii") === "GIF89a";
  const isWebp =
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP";

  if (isPng) return "image/png";
  if (isJpeg) return "image/jpeg";
  if (isGif) return "image/gif";
  if (isWebp) return "image/webp";
  return null;
}
