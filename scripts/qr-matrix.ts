import type { QRCode } from "jsqr";

// Fit a projective transform from the unit square to the detected QR boundary.
export function extractMatrix(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    code: QRCode,
) {
    const corners = [
        code.location.topLeftCorner,
        code.location.topRightCorner,
        code.location.bottomRightCorner,
        code.location.bottomLeftCorner,
    ];
    const square = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
    ];
    const equations = corners.flatMap(({ x, y }, index) => {
        const [u, v] = square[index];
        return [
            [u, v, 1, 0, 0, 0, -x * u, -x * v, x],
            [0, 0, 0, u, v, 1, -y * u, -y * v, y],
        ];
    });
    for (let column = 0; column < 8; column++) {
        let pivot = column;
        for (let row = column + 1; row < 8; row++) {
            if (
                Math.abs(equations[row][column]) >
                Math.abs(equations[pivot][column])
            )
                pivot = row;
        }
        [equations[column], equations[pivot]] = [
            equations[pivot],
            equations[column],
        ];
        const divisor = equations[column][column];
        if (Math.abs(divisor) < 1e-10)
            throw new Error("二维码边界不明确，请使用正面清晰图片。");
        equations[column] = equations[column].map((value) => value / divisor);
        for (let row = 0; row < 8; row++) {
            if (row === column) continue;
            const factor = equations[row][column];
            equations[row] = equations[row].map(
                (value, index) => value - factor * equations[column][index],
            );
        }
    }
    const [a, b, c, d, e, f, g, h] = equations.map((row) => row[8]);
    const size = 17 + 4 * code.version;
    const luminance: number[] = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const samples: number[] = [];
            for (const dy of [-0.15, 0, 0.15]) {
                for (const dx of [-0.15, 0, 0.15]) {
                    const u = (x + 0.5 + dx) / size;
                    const v = (y + 0.5 + dy) / size;
                    const denominator = g * u + h * v + 1;
                    const px = Math.floor((a * u + b * v + c) / denominator);
                    const py = Math.floor((d * u + e * v + f) / denominator);
                    if (
                        !Number.isFinite(px) ||
                        !Number.isFinite(py) ||
                        px < 0 ||
                        py < 0 ||
                        px >= width ||
                        py >= height
                    ) {
                        throw new Error(
                            "二维码边界超出图片，请提供完整二维码。",
                        );
                    }
                    const offset = (py * width + px) * 4;
                    samples.push(
                        0.299 * pixels[offset] +
                            0.587 * pixels[offset + 1] +
                            0.114 * pixels[offset + 2],
                    );
                }
            }
            samples.sort((left, right) => left - right);
            luminance.push(samples[4]);
        }
    }
    // Separate dark and light modules using their sampled brightness clusters.
    let dark = Math.min(...luminance);
    let light = Math.max(...luminance);
    for (let iteration = 0; iteration < 10; iteration++) {
        const threshold = (dark + light) / 2;
        const low = luminance.filter((value) => value <= threshold);
        const high = luminance.filter((value) => value > threshold);
        if (!low.length || !high.length) throw new Error("二维码对比度不足。");
        dark = low.reduce((sum, value) => sum + value, 0) / low.length;
        light = high.reduce((sum, value) => sum + value, 0) / high.length;
    }
    if (light - dark < 40)
        throw new Error("二维码对比度不足，请提供更清晰的图片。");
    const threshold = (dark + light) / 2;
    const bits = luminance.map((value) => (value <= threshold ? "1" : "0"));
    if (bits[0] !== "1")
        throw new Error("暂不支持反色二维码，请提供黑码白底图片。");
    return Array.from({ length: size }, (_, y) =>
        bits.slice(y * size, (y + 1) * size).join(""),
    );
}
