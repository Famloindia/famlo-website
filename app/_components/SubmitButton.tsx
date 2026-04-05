"use client";

import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  label: string;
}

export function SubmitButton({ label }: Readonly<SubmitButtonProps>): JSX.Element {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center rounded-full bg-[#1f2937] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#111827] disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending ? "Submitting..." : label}
    </button>
  );
}
