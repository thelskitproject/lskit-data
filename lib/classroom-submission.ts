import { decodeMatrix, type CheckinCode } from "./qr-code.ts";

export function validateClassroomSubmission(value: unknown): CheckinCode {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Please provide one classroom record as a JSON object.");
    const record = value as Record<string, unknown>;
    if (
        Object.keys(record).sort().join(",") !==
        "buildingName,matrix,roomName,roomNumber"
    )
        throw new Error(
            "The record must contain only buildingName, roomName, roomNumber, and matrix.",
        );
    function name(key: string, optional = false) {
        const text = record[key];
        if (optional && text === null) return null;
        if (
            typeof text !== "string" ||
            !text.trim() ||
            text.length > 200 ||
            /[\u0000-\u001f\u007f]/.test(text)
        )
            throw new Error(`${key} must be a valid name of at most 200 characters.`);
        return text.trim();
    }
    const buildingName = name("buildingName")!;
    const roomNumber = name("roomNumber")!;
    const roomName = name("roomName", true);
    if (typeof record.matrix !== "string" || record.matrix.length > 5224)
        throw new Error("Invalid QR matrix.");
    decodeMatrix(record.matrix);
    return { buildingName, roomNumber, roomName, matrix: record.matrix };
}

export function parseClassroomIssue(body: string): CheckinCode {
    if (body.length > 15000) throw new Error("The issue body is too long.");
    const blocks = [...body.matchAll(/^```json\s*\n([\s\S]*?)^```\s*$/gm)];
    if (blocks.length !== 1)
        throw new Error("Please provide exactly one json code block.");
    return validateClassroomSubmission(JSON.parse(blocks[0][1]));
}
