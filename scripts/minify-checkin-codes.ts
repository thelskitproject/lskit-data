import { readFile, writeFile } from "node:fs/promises";
import { validateClassroomSubmission } from "../lib/classroom-submission.ts";

const source = new URL("../checkin-codes.json", import.meta.url);
const destination = new URL("../checkin-codes.min.json", import.meta.url);
const records: unknown = JSON.parse(await readFile(source, "utf8"));
if (!Array.isArray(records)) throw new Error("Classroom records must be an array.");
records.forEach(validateClassroomSubmission);
await writeFile(destination, JSON.stringify(records) + "\n");
