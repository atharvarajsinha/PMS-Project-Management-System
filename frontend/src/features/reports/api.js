import api, { get } from "@/lib/api";
import { saveBlob } from "@/lib/csv";

export const listReports = () => get("/reports/");

const filenameOf = (headers, fallback) => {
  const match = /filename="?([^";]+)"?/i.exec(headers?.["content-disposition"] || "");
  return match ? match[1] : fallback;
};

const dropEmpty = (params) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/**
 * GET a file from the API and save it, named by the server's Content-Disposition (else `fallbackName`).
 * A blob response hides the API's error code, so an expired session is refreshed by one normal call and retried.
 */
export async function downloadFile(url, params, fallbackName) {
  const fetchFile = () => api.get(url, { params: dropEmpty(params), responseType: "blob", timeout: 120000 });
  let response;
  try {
    response = await fetchFile();
  } catch (error) {
    if (error?.status !== 401) throw error;
    await get("/me/"); // refreshes the session through the normal interceptor
    response = await fetchFile();
  }
  saveBlob(response.data, filenameOf(response.headers, fallbackName));
}

/** A report as "csv" or "xlsx"; `filters` = { semester_id?, semester_subject_id? }. */
export const downloadReport = (kind, format, filters = {}) =>
  downloadFile(`/reports/${kind}/`, { file_format: format, ...filters }, `pms-${kind}.${format}`);
