import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [done, setDone] = useState(false);

  const inputCls = cn(
    "w-full h-12 px-4 rounded-lg border border-[#d1d5db] bg-white text-[15px] text-[#0f172a]",
    "placeholder-[#9ca3af] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors",
  );
  const btnCls = cn(
    "w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[15px]",
    "flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
  );

  const sendOtpMutation = useMutation({
    mutationFn: () => authApi.forgotPassword(email),
    onSuccess: () => {
      setStep("otp");
      toast.success("OTP sent to your email — check your inbox");
    },
    onError: (e: any) => {
      // Always show success message to avoid email enumeration
      setStep("otp");
      toast.success("If that email is registered, an OTP has been sent");
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => authApi.verifyOtpAndReset(email, otp, newPassword),
    onSuccess: () => {
      setDone(true);
      toast.success("Password reset! You can now sign in.");
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail ?? e?.message ?? "Reset failed";
      toast.error(typeof msg === "string" ? msg : "Reset failed. Check your OTP and try again.");
    },
  });

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
        <div className="w-full max-w-sm text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold text-[#0f172a]">Password reset!</h1>
          <p className="text-[#64748b] text-sm">Your password has been updated. You can now sign in with your new password.</p>
          <button
            onClick={() => navigate({ to: "/login" })}
            className={btnCls}
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">S</div>
          <span className="font-bold text-lg text-[#0f172a]">SpinFlow ERP</span>
        </div>

        {step === "email" ? (
          <>
            <h1 className="text-[26px] font-bold text-[#0f172a]">Forgot password?</h1>
            <p className="text-[14px] text-[#64748b] mt-1">
              Enter your email and we'll send a 6-digit OTP to reset your password.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!email.trim()) return;
                sendOtpMutation.mutate();
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label htmlFor="email" className="block text-[14px] font-semibold text-[#374151] mb-1">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputCls}
                  placeholder="you@yourmill.com"
                />
              </div>
              <button type="submit" disabled={sendOtpMutation.isPending} className={btnCls}>
                {sendOtpMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending OTP…</>
                ) : "Send OTP"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-[26px] font-bold text-[#0f172a]">Enter OTP</h1>
            <p className="text-[14px] text-[#64748b] mt-1">
              We sent a 6-digit code to <span className="font-medium text-[#0f172a]">{email}</span>. Enter it below along with your new password.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!otp.trim() || !newPassword || newPassword !== confirmPassword) return;
                resetMutation.mutate();
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label htmlFor="otp" className="block text-[14px] font-semibold text-[#374151] mb-1">
                  6-digit OTP
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  className={cn(inputCls, "tracking-[0.3em] text-center font-mono text-lg")}
                  placeholder="——————"
                  autoComplete="one-time-code"
                />
              </div>
              <div>
                <label htmlFor="newPassword" className="block text-[14px] font-semibold text-[#374151] mb-1">
                  New password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className={inputCls}
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-[14px] font-semibold text-[#374151] mb-1">
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className={inputCls}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                )}
              </div>
              <button
                type="submit"
                disabled={resetMutation.isPending || !otp || otp.length < 6 || !newPassword || newPassword !== confirmPassword}
                className={btnCls}
              >
                {resetMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Resetting…</>
                ) : "Reset Password"}
              </button>

              <button
                type="button"
                onClick={() => sendOtpMutation.mutate()}
                disabled={sendOtpMutation.isPending}
                className="w-full text-center text-sm text-blue-600 hover:underline disabled:opacity-50"
              >
                {sendOtpMutation.isPending ? "Resending…" : "Resend OTP"}
              </button>
            </form>
          </>
        )}

        <div className="mt-6 flex items-center justify-center">
          <Link to="/login" className="flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#0f172a] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
