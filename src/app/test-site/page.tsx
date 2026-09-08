"use client";

import { FormEvent, useState } from "react";

export default function TestSitePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [actionCompleted, setActionCompleted] = useState(false);

  const handleLogin = (event: FormEvent) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      return;
    }

    setLoggedIn(true);
  };

  const handlePostAuthAction = () => {
    setActionCompleted(true);

    console.log(`Post-authentication action completed for ${email}`);
  };

  if (loggedIn) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
          <div
            className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full text-2xl ${
              actionCompleted
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-indigo-500/10 text-indigo-400"
            }`}
          >
            {actionCompleted ? "✓" : "✓"}
          </div>

          <p className="text-sm font-medium uppercase tracking-[0.25em] text-indigo-400">
            Test Environment
          </p>

          <h1 className="mt-3 text-3xl font-bold">Test Dashboard</h1>

          <p className="mt-3 text-slate-400">
            Authentication completed successfully.
          </p>

          <div
            data-testid="authenticated-user"
            className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4"
          >
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Authenticated Account
            </p>

            <p className="mt-2 font-medium text-white">{email}</p>
          </div>

          <div
            data-testid="action-status"
            className={`mt-4 rounded-xl border p-4 ${
              actionCompleted
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-slate-800 bg-slate-950"
            }`}
          >
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Workflow Status
            </p>

            <p
              className={`mt-2 font-semibold ${
                actionCompleted ? "text-emerald-400" : "text-slate-300"
              }`}
            >
              {actionCompleted
                ? "Post-authentication action completed"
                : "Waiting for post-authentication action"}
            </p>
          </div>

          <button
            data-testid="post-auth-action"
            type="button"
            onClick={handlePostAuthAction}
            disabled={actionCompleted}
            className="mt-6 w-full rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-emerald-600/80"
          >
            {actionCompleted ? "Action Completed" : "Complete Test Action"}
          </button>

          {actionCompleted && (
            <p
              data-testid="action-success"
              className="mt-4 text-sm text-emerald-400"
            >
              Test workflow completed successfully.
            </p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-indigo-400">
            Test Environment
          </p>

          <h1 className="mt-3 text-3xl font-bold">Test Login</h1>

          <p className="mt-2 text-slate-400">
            Controlled environment for browser workflow testing.
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
        >
          <div className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Email
              </label>

              <input
                id="email"
                data-testid="email-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="test@example.com"
                autoComplete="username"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Password
              </label>

              <input
                id="password"
                data-testid="password-input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Test password"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <button
              type="submit"
              data-testid="login-button"
              className="w-full rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 active:scale-[0.98]"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
