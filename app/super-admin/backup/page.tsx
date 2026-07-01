import { notFound } from "next/navigation";
import { BackupClient } from "./BackupClient";

export default function BackupPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <BackupClient />;
}
