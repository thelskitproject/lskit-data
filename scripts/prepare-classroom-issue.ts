import { readFile, writeFile, appendFile } from "node:fs/promises";
import {
    parseClassroomIssue,
    appendClassroomRecord,
} from "../lib/classroom-submission.ts";
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
    const updated = appendClassroomRecord(entries, record);
    await writeFile(destination, JSON.stringify(updated, null, 4) + "\n");
    await appendFile(process.env.GITHUB_OUTPUT!, "valid=true\n");
} catch (error) {
    await writeFile(
        "/tmp/classroom-issue-error.txt",
        `Thank you for contributing to LSKit!\n\nUnable to create a pull request: ${error instanceof Error ? error.message : "Record validation failed."}\n\nPlease correct the record in this issue. Validation will run again when you edit the issue.`,
    );
    process.exitCode = 1;
}
