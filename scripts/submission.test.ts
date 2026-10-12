import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseClassroomIssue } from "../lib/classroom-submission.ts";
import { verifyRestore } from "./verify-qr-matrix.ts";

test("all stored matrices restore and issue parser rejects malformed input", async () => {
    const entries = JSON.parse(
        await readFile(
            new URL("../checkin-codes.json", import.meta.url),
            "utf8",
        ),
    );
    for (const entry of entries) {
        const body =
            "### 教室记录\n\n```json\n" + JSON.stringify(entry) + "\n```";
        assert.deepEqual(parseClassroomIssue(body), entry);
        verifyRestore(entry.matrix);
        assert.throws(() => parseClassroomIssue(body + "\n" + body));
    }
    assert.throws(() => parseClassroomIssue("invalid"));
    assert.throws(() =>
        parseClassroomIssue('```json\n{"buildingName":"x"}\n```'),
    );
});
