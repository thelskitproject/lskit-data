import jsQR, { type QRCode } from "jsqr";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify, parseArgs } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import {
    readFile,
    writeFile,
    rename,
    unlink,
    open,
    mkdtemp,
    rm,
} from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
    decodeMatrix,
    encodeMatrix,
    type CheckinCode,
} from "../lib/qr-code.ts";
import { extractMatrix } from "./qr-matrix.ts";

type DecodedImage = { matrix: string; decoded: QRCode };

const wasmReady = readFile(
    createRequire(import.meta.url).resolve(
        "zxing-wasm/reader/zxing_reader.wasm",
    ),
).then((binary) =>
    prepareZXingModule({
        overrides: { wasmBinary: Uint8Array.from(binary).buffer },
    }),
);

export async function decodePerspectiveImage(
    pixels: Uint8ClampedArray<ArrayBuffer>,
    width: number,
    height: number,
): Promise<DecodedImage> {
    await wasmReady;
    const results = await readBarcodes(
        { data: pixels, width, height, colorSpace: "srgb" },
        {
            formats: ["QRCodeModel2"],
            tryHarder: true,
            tryInvert: false,
            maxNumberOfSymbols: 2,
        },
    );
    if (results.length !== 1)
        throw new Error("请提供清晰且只包含一个二维码的图片。");
    const result = results[0];
    const { data, width: size, height: rows } = result.symbol;
    if (size !== rows || data.length !== size * size)
        throw new Error("二维码模块矩阵无效。");
    // ZXing returns the sampled symbol, not a new code generated from its payload.
    const matrix = encodeMatrix(
        Array.from({ length: size }, (_, y) =>
            Array.from({ length: size }, (_, x) =>
                data[y * size + x] === 0 ? "1" : "0",
            ).join(""),
        ),
    );
    const decoded = verifyRestore(matrix);
    if (
        JSON.stringify(decoded.binaryData) !==
        JSON.stringify(Array.from(result.bytes))
    ) {
        throw new Error("透视校正后的二维码数据不一致，未写入文件。");
    }
    return { matrix, decoded };
}

export async function decodeImage(
    image: string | Buffer,
): Promise<DecodedImage> {
    if (
        typeof image === "string" &&
        /\.hei[cf]$/i.test(image) &&
        process.platform === "darwin"
    ) {
        const directory = await mkdtemp(join(tmpdir(), "lskit-heic-"));
        try {
            const converted = join(directory, "qr.png");
            await promisify(execFile)("/usr/bin/sips", [
                "-s",
                "format",
                "png",
                image,
                "--out",
                converted,
            ]);
            return await decodeImage(converted);
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
    const { data, info } = await sharp(image, { limitInputPixels: 20000000 })
        .rotate()
        .flatten({ background: "white" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const pixels = new Uint8ClampedArray(data);
    const decoded = jsQR(pixels, info.width, info.height);
    if (decoded) {
        try {
            const matrix = encodeMatrix(
                extractMatrix(pixels, info.width, info.height, decoded),
            );
            verifyRestore(matrix, decoded);
            return { decoded, matrix };
        } catch {
            const corrected = await decodePerspectiveImage(
                pixels,
                info.width,
                info.height,
            );
            verifyRestore(corrected.matrix, decoded);
            return corrected;
        }
    }
    return decodePerspectiveImage(pixels, info.width, info.height);
}

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

export async function importCheckinCode(
    image: string | Buffer,
    buildingName: string,
    roomNumber: string,
    roomName: string | null,
    destination: string,
) {
    if (!image || !buildingName?.trim() || !roomNumber?.trim()) {
        throw new Error(
            '用法：pnpm import:qr <图片路径> --building-name "Building Name" --room-number "Room Number" [--room-name "Room Name"]',
        );
    }
    const lockPath = `${destination}.lock`;
    const lock = await open(lockPath, "wx");
    try {
        const entries: CheckinCode[] = JSON.parse(
            await readFile(destination, "utf8"),
        );
        if (!Array.isArray(entries))
            throw new Error("记录文件必须是 JSON 数组。");
        for (const entry of entries) {
            if (
                typeof entry.buildingName !== "string" ||
                !entry.buildingName.trim() ||
                typeof entry.roomNumber !== "string" ||
                !entry.roomNumber.trim() ||
                !(
                    entry.roomName === null ||
                    (typeof entry.roomName === "string" &&
                        entry.roomName.trim())
                )
            ) {
                throw new Error("已有记录缺少教学楼或房间号，未写入文件。");
            }
            verifyRestore(entry.matrix);
        }
        if (
            entries.some(
                (entry) =>
                    entry.buildingName.toLowerCase() ===
                        buildingName.trim().toLowerCase() &&
                    entry.roomNumber.toLowerCase() ===
                        roomNumber.trim().toLowerCase(),
            )
        ) {
            throw new Error(
                "该教学楼和房间已有记录，请先核实并手动更新，避免覆盖原数据。",
            );
        }
        const { matrix, decoded } = await decodeImage(image);
        verifyRestore(matrix, decoded);
        entries.push({
            buildingName: buildingName.trim(),
            roomNumber: roomNumber.trim(),
            roomName: roomName?.trim() || null,
            matrix,
        });
        const temporary = `${destination}.${process.pid}.tmp`;
        try {
            await writeFile(
                temporary,
                JSON.stringify(entries, null, 4) + "\n",
                { flag: "wx" },
            );
            await rename(temporary, destination);
        } finally {
            await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
                if (error.code !== "ENOENT") throw error;
            });
        }
    } finally {
        await lock.close();
        await unlink(lockPath);
    }
}

export function parseImportArgs(args: string[]) {
    const { values, positionals, tokens } = parseArgs({
        args,
        allowPositionals: true,
        tokens: true,
        options: {
            "building-name": { type: "string" },
            "room-number": { type: "string" },
            "room-name": { type: "string" },
        },
    });
    const seen = new Set<string>();
    for (const token of tokens) {
        if (token.kind !== "option") continue;
        if (seen.has(token.name))
            throw new Error(`参数 --${token.name} 重复。`);
        seen.add(token.name);
    }
    if (positionals.length !== 1 || !positionals[0].trim())
        throw new Error("请提供一个二维码图片路径。");
    for (const name of ["building-name", "room-number"] as const) {
        if (!values[name]?.trim()) throw new Error(`请提供 --${name}。`);
    }
    if (values["room-name"] !== undefined && !values["room-name"].trim()) {
        throw new Error("--room-name 不能为空；未知时请省略该参数。");
    }
    return {
        image: positionals[0],
        buildingName: values["building-name"]!.trim(),
        roomNumber: values["room-number"]!.trim(),
        roomName: values["room-name"]?.trim() ?? null,
    };
}

async function main() {
    const { image, buildingName, roomNumber, roomName } = parseImportArgs(
        process.argv.slice(2),
    );
    const destination = fileURLToPath(
        new URL("../checkin-codes.json", import.meta.url),
    );
    await importCheckinCode(
        image,
        buildingName,
        roomNumber,
        roomName ?? null,
        destination,
    );
    console.log(
        `已记录 ${buildingName} / ${roomNumber}，并通过二进制矩阵与数据还原校验。`,
    );
}

if (
    process.argv[1] &&
    pathToFileURL(process.argv[1]).href === import.meta.url
) {
    main().catch((error: Error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
