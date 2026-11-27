import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorState from "@/components/common/ErrorState";
import FormActions from "@/components/common/FormActions";
import FormError from "@/components/common/FormError";
import { Form } from "@/components/common/fields";
import FacultyProfileFields, {
  PROFILE_FIELD_NAMES,
  profileBody,
  profileDefaults,
  profileSchema,
} from "@/features/faculty/components/FacultyProfileFields";
import { getMyFacultyProfile, updateMyFacultyProfile } from "@/features/specializations/api";
import { useApiMutation } from "@/hooks/useApiMutation";
import { applyApiErrors } from "@/lib/forms";

const schema = z.object(profileSchema);

/** Faculty: their own specializations, research areas, papers and certifications. */
export default function FacultyProfileCard() {
  const query = useQuery({ queryKey: ["my-faculty-profile"], queryFn: getMyFacultyProfile });
  const [formError, setFormError] = useState(null);
  const form = useForm({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: profileDefaults(null) });

  useEffect(() => {
    if (query.data) form.reset(profileDefaults(query.data));
  }, [query.data, form]);

  const mutation = useApiMutation((v) => updateMyFacultyProfile(profileBody(v)), {
    invalidate: [["my-faculty-profile"]],
    success: "Profile updated",
    silentError: true,
    onSuccess: (data) => form.reset(profileDefaults(data)),
  });

  const onSubmit = (values) => {
    setFormError(null);
    return mutation.mutateAsync(values).catch((error) => setFormError(applyApiErrors(form, error, PROFILE_FIELD_NAMES)));
  };

  return (
    <section className="rounded-[1.25rem] border border-border/80 bg-card shadow-soft p-4 md:p-6" aria-labelledby="faculty-profile-title">
      <h2 id="faculty-profile-title" className="text-lg font-semibold">
        Academic profile
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Your specializations, research and achievements. Your admin sees this, and students see your specializations when choosing a mentor.
      </p>
      {query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : query.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
            <FormError message={formError} />
            <FacultyProfileFields form={form} />
            <FormActions submitLabel="Save profile" pending={mutation.isPending} disabled={!form.formState.isDirty} />
          </form>
        </Form>
      )}
    </section>
  );
}
