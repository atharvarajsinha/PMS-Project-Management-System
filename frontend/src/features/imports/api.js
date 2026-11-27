import api, { get } from "@/lib/api";
import { saveBlob } from "@/lib/csv";

export const listImports = () => get("/imports/");

// dryRun = validate and preview only (nothing is saved). Large files can take a while.
export const runImport = (kind, file, { dryRun = false } = {}) => {
  const body = new FormData();
  body.append("file", file);
  return api
    .post(`/imports/${kind}/`, body, { params: dryRun ? { dry_run: true } : undefined, timeout: 120000 })
    .then((r) => r.data);
};

export const downloadTemplate = (kind) =>
  api.get(`/imports/${kind}/template/`, { responseType: "blob" }).then((r) => saveBlob(r.data, `pms-${kind}-template.csv`));

// Query keys each import can change
const INVALIDATE = {
  specializations: [["specializations"], ["faculty"]],
  faculty: [["faculty"], ["specializations"], ["dashboard"]],
  semesters: [["semesters"], ["dashboard"]],
  subjects: [["subjects"], ["dashboard"]],
  sections: [["sections"], ["semesters"], ["faculty"], ["dashboard"]],
  students: [["students"], ["sections"], ["semesters"], ["dashboard"]],
  "subject-mappings": [["semester-subjects"], ["section-subjects"], ["sections"], ["subjects"], ["faculty"], ["dashboard"]],
};

export const importInvalidate = (kind) => INVALIDATE[kind] || [];
