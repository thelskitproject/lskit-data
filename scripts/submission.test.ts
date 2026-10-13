import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseClassroomIssue } from "../lib/classroom-submission.ts";
import { verifyRestore } from "./verify-qr-matrix.ts";
import { validateCompactPR } from "./merge-compact-records.ts";

test("automatic merge only accepts the exact bot-generated compact file", () => {
    const repository = "thelskitproject/lskit-data";
    const pr = {
        user: { login: "github-actions[bot]" },
        base: { ref: "main", sha: "current" },
        head: {
            ref: "bot/minify-checkin-codes",
            repo: { full_name: repository },
        },
        state: "open",
        draft: false,
    };
    const files = ["checkin-codes.min.json"];
    const source = '[{"roomNumber":"G.89"}]';
    const compact = source + "\n";
    assert.doesNotThrow(() =>
        validateCompactPR(pr, files, repository, "current", source, compact),
    );
    assert.throws(() =>
        validateCompactPR(
            pr,
            ["checkin-codes.json"],
            repository,
            "current",
            source,
            compact,
        ),
    );
    assert.throws(() =>
        validateCompactPR(
            pr,
            [...files, "README.md"],
            repository,
            "current",
            source,
            compact,
        ),
    );
    assert.throws(() =>
        validateCompactPR(
            { ...pr, user: { login: "someone" } },
            files,
            repository,
            "current",
            source,
            compact,
        ),
    );
    assert.throws(() =>
        validateCompactPR(
            { ...pr, head: { ...pr.head, ref: "classroom-issue-1" } },
            files,
            repository,
            "current",
            source,
            compact,
        ),
    );
    assert.throws(() =>
        validateCompactPR(pr, files, repository, "newer", source, compact),
    );
    assert.throws(() =>
        validateCompactPR(pr, files, repository, "current", source, "[]\n"),
    );
});

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
