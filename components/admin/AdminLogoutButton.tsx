export function AdminLogoutButton(): JSX.Element {
  return (
    <form action="/api/admin/logout" method="post">
      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-famloText transition hover:border-famloBlue hover:text-famloBlue"
      >
        Log out
      </button>
    </form>
  );
}
