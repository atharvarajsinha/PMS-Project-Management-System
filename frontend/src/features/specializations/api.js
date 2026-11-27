import { useQuery } from "@tanstack/react-query";
import { del, get, patch, post } from "@/lib/api";
import { idStr } from "@/lib/ids";

// The college's list of faculty specializations (AI/ML, Cyber Security, ...)
export const listSpecializations = (params) => get("/specializations/", params);
export const createSpecialization = (body) => post("/specializations/", body);
export const updateSpecialization = (id, body) => patch(`/specializations/${id}/`, body);
export const deleteSpecialization = (id) => del(`/specializations/${id}/`);

// A faculty member's own profile
export const getMyFacultyProfile = () => get("/me/faculty-profile/");
export const updateMyFacultyProfile = (body) => patch("/me/faculty-profile/", body);

export const specializationsInvalidate = [["specializations"], ["faculty"], ["my-faculty-profile"]];

/** Every specialization of the college, as { value, label } options (values are id strings). */
export function useSpecializationOptions() {
  const query = useQuery({
    queryKey: ["specializations", "options"],
    queryFn: () => listSpecializations({ page_size: 200, ordering: "name" }),
  });
  const specializations = query.data?.results || [];
  const options = specializations.map((s) => ({ value: idStr(s.id), label: s.name }));
  return { ...query, specializations, options, isEmpty: query.isSuccess && options.length === 0 };
}
