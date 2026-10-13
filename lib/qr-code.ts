export type CheckinCode = {
    buildingName: string;
    roomNumber: string;
    roomName: string | null;
    matrix: string;
};

// Row-major modules, most significant bit first; unused final bits are zero.
export function encodeMatrix(rows: string[]) {
    const bits = rows.join("");
    const bytes = new Uint8Array(Math.ceil(bits.length / 8));
    for (let index = 0; index < bits.length; index++) {
        if (bits[index] === "1") bytes[index >> 3] |= 1 << (7 - (index & 7));
    }
    return btoa(String.fromCharCode(...bytes));
}

export function decodeMatrix(matrix: string) {
    if (typeof matrix !== "string") throw new Error("Invalid QR module matrix.");
    let bytes: string;
    try {
        bytes = atob(matrix);
    } catch {
        throw new Error("Invalid QR module matrix.");
    }
    const size = Math.floor(Math.sqrt(bytes.length * 8));
    const unused = (8 - ((size * size) % 8)) % 8;
    if (
        size < 21 ||
        size > 177 ||
        size % 4 !== 1 ||
        bytes.length !== Math.ceil((size * size) / 8) ||
        btoa(bytes) !== matrix ||
        (bytes.charCodeAt(bytes.length - 1) & ((1 << unused) - 1)) !== 0
    ) {
        throw new Error("Invalid QR module matrix.");
    }
    return Array.from({ length: size }, (_, y) =>
        Array.from({ length: size }, (_, x) => {
            const index = y * size + x;
            return bytes.charCodeAt(index >> 3) & (1 << (7 - (index & 7)))
                ? "1"
                : "0";
        }).join(""),
    );
}
