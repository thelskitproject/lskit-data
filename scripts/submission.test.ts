import { test } from "node:test";
import assert from "node:assert/strict";
import {
    readFile,
    mkdtemp,
    mkdir,
    writeFile,
    copyFile,
    rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    parseClassroomIssue,
    appendClassroomRecord,
    canRefreshClassroomPR,
} from "../lib/classroom-submission.ts";
import { verifyRestore } from "./verify-qr-matrix.ts";

test("refresh after B merges retains B and only adds A", async () => {
    const entries = JSON.parse(
        await readFile(
            new URL("../checkin-codes.json", import.meta.url),
            "utf8",
        ),
    );
    const a = { ...entries[0], roomNumber: "pending-A" };
    const b = { ...entries[0], roomNumber: "merged-B" };
    const headA = appendClassroomRecord(entries, a);
    const mainB = appendClassroomRecord(entries, b);
    const files = ["checkin-codes.json", "checkin-codes.min.json"];
    const compact = JSON.stringify(headA) + "\n";
    assert.equal(
        canRefreshClassroomPR(entries, headA, a, files, compact),
        true,
    );
    const refreshed = appendClassroomRecord(mainB, a);
    assert.deepEqual(refreshed, [...entries, b, a]);
    assert.equal(
        canRefreshClassroomPR(entries, [...headA, b], a, files, compact),
        false,
    );
    assert.equal(
        canRefreshClassroomPR(
            entries,
            headA,
            a,
            [...files, "README.md"],
            compact,
        ),
        false,
    );
    assert.equal(
        canRefreshClassroomPR(entries, headA, a, files, "[]\n"),
        false,
    );
    assert.throws(() =>
        appendClassroomRecord(mainB, { ...b, matrix: a.matrix }),
    );
});

test("compact generation preserves all fields and refuses invalid source data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lskit-minify-"));
    try {
        await mkdir(join(directory, "scripts"));
        await mkdir(join(directory, "lib"));
        for (const file of [
            "scripts/minify-checkin-codes.ts",
            "lib/classroom-submission.ts",
            "lib/qr-code.ts",
        ])
            await copyFile(
                new URL(`../${file}`, import.meta.url),
                join(directory, file),
            );
        await writeFile(join(directory, "package.json"), '{"type":"module"}');
        const source = await readFile(
            new URL("../checkin-codes.json", import.meta.url),
            "utf8",
        );
        await writeFile(join(directory, "checkin-codes.json"), source);
        const run = () =>
            execFileSync(
                process.execPath,
                [join(directory, "scripts/minify-checkin-codes.ts")],
                { stdio: "pipe" },
            );
        run();
        const compact = await readFile(
            join(directory, "checkin-codes.min.json"),
            "utf8",
        );
        assert.deepEqual(JSON.parse(compact), JSON.parse(source));
        assert.equal(compact.trim().split("\n").length, 1);
        await writeFile(
            join(directory, "checkin-codes.json"),
            '[{"matrix":"invalid"}]',
        );
        assert.throws(run);
        assert.equal(
            await readFile(join(directory, "checkin-codes.min.json"), "utf8"),
            compact,
        );
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
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
