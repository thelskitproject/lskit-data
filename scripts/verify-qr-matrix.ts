import jsQR, { type QRCode } from "jsqr";
import { decodeMatrix, encodeMatrix } from "../lib/qr-code.ts";
import { extractMatrix } from "./qr-matrix.ts";

export function verifyRestore(
    packed: string,
    expected?: Pick<QRCode, "version" | "data" | "binaryData" | "chunks">,
) {
    const matrix = decodeMatrix(packed);
    const dimension = matrix.length;
    const scale = 8;
    const size = (dimension + 8) * scale;
    const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
    for (let y = 0; y < dimension; y++) {
        for (let x = 0; x < dimension; x++) {
            if (matrix[y][x] !== "1") continue;
            for (let dy = 0; dy < scale; dy++) {
                for (let dx = 0; dx < scale; dx++) {
                    const offset =
                        (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) *
                        4;
                    pixels.fill(0, offset, offset + 3);
                }
            }
        }
    }
    const decoded = jsQR(pixels, size, size, {
        inversionAttempts: "dontInvert",
    });
    if (
        !decoded ||
        (expected &&
            (decoded.version !== expected.version ||
                decoded.data !== expected.data ||
                JSON.stringify(decoded.binaryData) !==
                    JSON.stringify(expected.binaryData) ||
                JSON.stringify(decoded.chunks) !==
                    JSON.stringify(expected.chunks)))
    ) {
        throw new Error("二维码还原校验失败，未写入文件。");
    }
    const extracted = extractMatrix(pixels, size, size, decoded);
    if (encodeMatrix(extracted) !== packed) {
        throw new Error("二维码模块图案校验失败，未写入文件。");
    }
    return decoded;
}
