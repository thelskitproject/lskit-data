import { decodeMatrix, type CheckinCode } from "./qr-code.ts";

export const classroomIssueURL =
    "https://github.com/thelskitproject/lskit-data/issues/new?template=add-classroom.yml";

export function validateClassroomSubmission(value: unknown): CheckinCode {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("请提供一条教室 JSON 记录。");
    const record = value as Record<string, unknown>;
    if (
        Object.keys(record).sort().join(",") !==
        "buildingName,matrix,roomName,roomNumber"
    )
        throw new Error(
            "记录只能包含 buildingName、roomName、roomNumber、matrix。",
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
            throw new Error(`${key} 需要填写有效名称（最多 200 字符）。`);
        return text.trim();
    }
    const buildingName = name("buildingName")!;
    const roomNumber = name("roomNumber")!;
    const roomName = name("roomName", true);
    if (typeof record.matrix !== "string" || record.matrix.length > 5224)
        throw new Error("二维码矩阵无效。");
    decodeMatrix(record.matrix);
    return { buildingName, roomNumber, roomName, matrix: record.matrix };
}

export function parseClassroomIssue(body: string): CheckinCode {
    if (body.length > 15000) throw new Error("Issue 内容过长。");
    const blocks = [...body.matchAll(/^```json\s*\n([\s\S]*?)^```\s*$/gm)];
    if (blocks.length !== 1)
        throw new Error("请提供且只提供一个 json 代码块。");
    return validateClassroomSubmission(JSON.parse(blocks[0][1]));
}
