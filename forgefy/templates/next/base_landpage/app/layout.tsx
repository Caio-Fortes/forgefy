import type { Metadata } from "next";
import "./globals.scss";

export const metadata: Metadata = {
  title: "projeto",
  description: "new project",
  icons: {
    icon: "/icons/next._icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
