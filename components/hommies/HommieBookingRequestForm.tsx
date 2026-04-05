"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import { createBrowserSupabaseClient } from "../../lib/supabase";
import type { Database, Hommie } from "../../lib/types";

type HommieBookingInsert =
  Database["public"]["Tables"]["hommie_booking_requests"]["Insert"];

interface HommieBookingRequestFormProps {
  hommie: Hommie;
}

interface FormState {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  notes: string;
}

const initialState: FormState = {
  guestName: "",
  guestEmail: "",
  guestPhone: "",
  checkIn: "",
  checkOut: "",
  guests: "1",
  notes: ""
};

export function HommieBookingRequestForm({
  hommie
}: HommieBookingRequestFormProps): JSX.Element {
  const [formState, setFormState] = useState<FormState>(initialState);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void {
    const { name, value } = event.target;
    setFormState((currentState) => ({ ...currentState, [name]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSubmitting(true);
    setStatusMessage("");

    try {
      const supabase = createBrowserSupabaseClient();
      const payload: HommieBookingInsert = {
        hommie_id: hommie.id,
        guest_name: formState.guestName.trim(),
        guest_email: formState.guestEmail.trim(),
        guest_phone: formState.guestPhone.trim() || null,
        check_in: formState.checkIn,
        check_out: formState.checkOut,
        guests: Number(formState.guests),
        notes: formState.notes.trim() || null,
        status: "pending"
      };

      const { error } = await supabase
        .from("hommie_booking_requests")
        .insert(payload as never);

      if (error) {
        throw error;
      }

      setStatusMessage(
        "Your booking request has been sent. The Famlo team will review it with the host."
      );
      setFormState(initialState);
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to send booking request."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[28px] border border-[#D5E7F8] bg-white p-6 shadow-[0_20px_60px_rgba(26,110,187,0.08)]"
    >
      <h3 className="text-xl font-semibold text-famloText">Request to book</h3>
      <div className="mt-6 grid gap-4">
        <input
          name="guestName"
          value={formState.guestName}
          onChange={handleChange}
          required
          placeholder="Your full name"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
        />
        <input
          name="guestEmail"
          type="email"
          value={formState.guestEmail}
          onChange={handleChange}
          required
          placeholder="Your email"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
        />
        <input
          name="guestPhone"
          value={formState.guestPhone}
          onChange={handleChange}
          placeholder="Phone number"
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <input
            name="checkIn"
            type="date"
            value={formState.checkIn}
            onChange={handleChange}
            required
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          />
          <input
            name="checkOut"
            type="date"
            value={formState.checkOut}
            onChange={handleChange}
            required
            className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
          />
        </div>
        <input
          name="guests"
          type="number"
          min="1"
          max={hommie.max_guests}
          value={formState.guests}
          onChange={handleChange}
          required
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
        />
        <textarea
          name="notes"
          value={formState.notes}
          onChange={handleChange}
          rows={4}
          placeholder="Any special request"
          className="rounded-3xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-famloBlue focus:ring-2 focus:ring-[#D4E7FB]"
        />
        {statusMessage ? (
          <p className="text-sm text-slate-600">{statusMessage}</p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-famloBlue px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#155d9f] disabled:opacity-70"
        >
          {isSubmitting ? "Sending..." : "Send booking request"}
        </button>
      </div>
    </form>
  );
}
