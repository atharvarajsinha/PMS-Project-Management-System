import { get, post, put } from "@/lib/api";

// College Admin: every team × phase with evaluator, submission and marks
export const listEvaluations = (params) => get("/evaluations/", params);
export const correctMarks = (id, body) => put(`/evaluations/${id}/marks/`, body);

// Faculty: teams I evaluate
export const listMyEvaluations = (params) => get("/my/evaluations/", params);
export const listMyEvaluationPhases = () => get("/my/evaluations/phases/");
export const saveMyMarks = (id, body) => put(`/my/evaluations/${id}/marks/`, body);
export const nameTeam = (id, name) => post(`/my/evaluations/${id}/team-name/`, { name });
