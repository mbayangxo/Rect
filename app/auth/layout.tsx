export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#040d06] text-[#f8f8f8]">{children}</div>
  );
}
