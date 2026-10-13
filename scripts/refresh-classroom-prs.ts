import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import {
    appendClassroomRecord,
    canRefreshClassroomPR,
    parseClassroomIssue,
} from "../lib/classroom-submission.ts";

const repository = process.env.GITHUB_REPOSITORY!;
const execute = promisify(execFile);
async function git(args: string[]) {
    return (await execute("git", args)).stdout.trim();
}
const mainSHA = await git(["rev-parse", "HEAD"]);
await git(["config", "user.name", "github-actions[bot]"]);
await git([
    "config",
    "user.email",
    "41898282+github-actions[bot]@users.noreply.github.com",
]);
async function api(path: string) {
    const response = await fetch(
        `https://api.github.com/repos/${repository}/${path}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.GH_TOKEN}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
            },
        },
    );
    if (!response.ok) throw new Error(`GitHub API failed: ${response.status}`);
    return response.json();
}
async function content(path: string, ref: string) {
    const file = await api(`contents/${path}?ref=${ref}`);
    return Buffer.from(file.content, "base64").toString("utf8");
}
const currentRecords = JSON.parse(await content("checkin-codes.json", mainSHA));
for (let page = 1; ; page++) {
    const prs = await api(
        `pulls?state=open&base=main&per_page=100&page=${page}`,
    );
    for (const pr of prs) {
        const match = /^classroom-issue-([1-9][0-9]*)$/.exec(pr.head.ref);
        if (
            !match ||
            pr.user.login !== "github-actions[bot]" ||
            pr.head.repo?.full_name !== repository
        )
            continue;
        try {
            const issue = await api(`issues/${match[1]}`);
            if (issue.state !== "open" || !issue.title.startsWith("[新增教室]"))
                continue;
            const record = parseClassroomIssue(issue.body ?? "");
            const comparison = await api(`compare/main...${pr.head.sha}`);
            if (comparison.merge_base_commit.sha === mainSHA) continue;
            const base = JSON.parse(
                await content(
                    "checkin-codes.json",
                    comparison.merge_base_commit.sha,
                ),
            );
            const head = JSON.parse(
                await content("checkin-codes.json", pr.head.sha),
            );
            const compact = await content(
                "checkin-codes.min.json",
                pr.head.sha,
            );
            const files = await api(`pulls/${pr.number}/files?per_page=100`);
            if (
                !canRefreshClassroomPR(
                    base,
                    head,
                    record,
                    files.map((file: { filename: string }) => file.filename),
                    compact,
                )
            ) {
                console.log(
                    `PR #${pr.number} contains manual changes; leaving it for maintainer review.`,
                );
                continue;
            }
            const updated = appendClassroomRecord(currentRecords, record);
            await git(["checkout", "--detach", mainSHA]);
            await writeFile(
                "checkin-codes.json",
                JSON.stringify(updated, null, 4) + "\n",
            );
            await writeFile(
                "checkin-codes.min.json",
                JSON.stringify(updated) + "\n",
            );
            await git([
                "add",
                "--",
                "checkin-codes.json",
                "checkin-codes.min.json",
            ]);
            await git([
                "commit",
                "-m",
                `Refresh classroom from issue #${match[1]} against main`,
            ]);
            // The lease rejects intervening pushes, including manual edits.
            await git([
                "push",
                `--force-with-lease=refs/heads/${pr.head.ref}:${pr.head.sha}`,
                "origin",
                `HEAD:refs/heads/${pr.head.ref}`,
            ]);
            console.log(`Refreshed PR #${pr.number} against main.`);
        } catch (error) {
            console.error(
                `PR #${pr.number} was not refreshed: ${error instanceof Error ? error.message : "Validation failed."}`,
            );
            process.exitCode = 1;
        }
    }
    if (prs.length < 100) break;
}
