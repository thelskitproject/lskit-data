import { pathToFileURL } from "node:url";

export function validateCompactPR(
    pr: {
        user: { login: string };
        base: { ref: string; sha: string };
        head: { ref: string; repo: { full_name: string } };
        state: string;
        draft: boolean;
    },
    files: string[],
    repository: string,
    mainSHA: string,
    source: string,
    compact: string,
) {
    if (
        pr.user.login !== "github-actions[bot]" ||
        pr.head.ref !== "bot/minify-checkin-codes" ||
        pr.head.repo.full_name !== repository ||
        pr.base.ref !== "main" ||
        pr.base.sha !== mainSHA ||
        pr.state !== "open" ||
        pr.draft
    )
        throw new Error(
            "Only the current bot-generated compact records PR may be merged automatically.",
        );
    if (files.length !== 1 || files[0] !== "checkin-codes.min.json")
        throw new Error("Automatic merge requires exactly one generated file.");
    const records: unknown = JSON.parse(source);
    if (!Array.isArray(records) || compact !== JSON.stringify(records) + "\n")
        throw new Error("Compact records do not match the source on main.");
}

async function merge() {
    const repository = process.env.GITHUB_REPOSITORY!;
    const number = Number(process.env.PR_NUMBER);
    if (!Number.isSafeInteger(number) || number < 1)
        throw new Error("Invalid PR number.");
    async function api(path: string, body?: unknown) {
        const response = await fetch(
            `https://api.github.com/repos/${repository}/${path}`,
            {
                method: body ? "PUT" : "GET",
                headers: {
                    Authorization: `Bearer ${process.env.GH_TOKEN}`,
                    Accept: "application/vnd.github+json",
                    "Content-Type": "application/json",
                },
                body: body ? JSON.stringify(body) : undefined,
            },
        );
        if (!response.ok)
            throw new Error(
                `GitHub API failed: ${response.status} ${await response.text()}`,
            );
        return response.json();
    }
    const pr = await api(`pulls/${number}`);
    const main = await api("git/ref/heads/main");
    const files = await api(`pulls/${number}/files?per_page=100`);
    const source = await api(
        `contents/checkin-codes.json?ref=${main.object.sha}`,
    );
    const compact = await api(
        `contents/checkin-codes.min.json?ref=${pr.head.sha}`,
    );
    validateCompactPR(
        pr,
        files.map((file: { filename: string }) => file.filename),
        repository,
        main.object.sha,
        Buffer.from(source.content, "base64").toString("utf8"),
        Buffer.from(compact.content, "base64").toString("utf8"),
    );
    // Recheck main immediately before merging, and pin the PR head to prevent edits.
    const current = await api("git/ref/heads/main");
    if (current.object.sha !== main.object.sha)
        throw new Error(
            "Main changed during validation. Run the workflow again.",
        );
    const result = await api(`pulls/${number}/merge`, {
        sha: pr.head.sha,
        merge_method: "squash",
    });
    if (!result.merged)
        throw new Error("The compact records PR was not merged.");
    console.log(`Merged compact records PR #${number}.`);
}

if (
    process.argv[1] &&
    pathToFileURL(process.argv[1]).href === import.meta.url
) {
    await merge();
}
