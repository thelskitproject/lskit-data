import { readFile, writeFile, appendFile } from "node:fs/promises";
import { parseClassroomIssue } from "../lib/classroom-submission.ts";
import { verifyRestore } from "./verify-qr-matrix.ts";
import type { CheckinCode } from "../lib/qr-code.ts";

try {
    const event = JSON.parse(
        await readFile(process.env.GITHUB_EVENT_PATH!, "utf8"),
    );
    const record = parseClassroomIssue(event.issue.body ?? "");
    verifyRestore(record.matrix);
    const destination = new URL("../checkin-codes.json", import.meta.url);
    const entries: CheckinCode[] = JSON.parse(
        await readFile(destination, "utf8"),
    );
    if (
        entries.some(
            (entry) =>
                entry.buildingName.toLowerCase() ===
                    record.buildingName.toLowerCase() &&
                entry.roomNumber.toLowerCase() ===
                    record.roomNumber.toLowerCase(),
        )
    )
        throw new Error(
            "该教学楼和房间号已经收录，请由维护者确认是否需要更新。",
        );
    await writeFile(
        destination,
        JSON.stringify([...entries, record], null, 4) + "\n",
    );
    await appendFile(process.env.GITHUB_OUTPUT!, "valid=true\n");
} catch (error) {
    await writeFile(
        "/tmp/classroom-issue-error.txt",
        `无法生成 PR：${error instanceof Error ? error.message : "记录校验失败"}\n\n请修改 Issue 中的记录后重试。`,
    );
    process.exitCode = 1;
}
